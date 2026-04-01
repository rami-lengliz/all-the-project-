import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { readAuth } from '@/lib/auth/storage';
import type { Message } from '@/lib/api/chat';

const SOCKET_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/chat`;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type TypingPayload = {
  userId: string;
  conversationId: string;
  isTyping: boolean;
};

export type NewMessageCallback = (msg: Message) => void;
export type TypingCallback     = (payload: TypingPayload) => void;

export interface UseChatSocketReturn {
  /** Whether the socket is currently connected. */
  connected: boolean;
  /** Last connection error message, if any. */
  lastError: string | null;
  /** Join a conversation room so you receive push events for it. */
  joinConversation: (conversationId: string) => void;
  /** Leave a conversation room (call on unmount). */
  leaveConversation: (conversationId: string) => void;
  /** Send a message via socket (server persists + broadcasts). */
  sendMessage: (conversationId: string, content: string) => void;
  /** Emit a typing indicator. */
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  /**
   * Subscribe to incoming messages (from the other participant).
   * Returns a cleanup function — call it in useEffect cleanup.
   */
  onNewMessage: (cb: NewMessageCallback) => () => void;
  /**
   * Subscribe to message-sent confirmation (echoed back to sender by backend).
   * Returns a cleanup function — call it in useEffect cleanup.
   */
  onMessageSent: (cb: NewMessageCallback) => () => void;
  /**
   * Subscribe to typing events from the other participant.
   * Returns a cleanup function — call it in useEffect cleanup.
   */
  onTyping: (cb: TypingCallback) => () => void;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useChatSocket(): UseChatSocketReturn {
  const socketRef       = useRef<Socket | null>(null);
  const [connected,   setConnected]   = useState(false);
  const [lastError,   setLastError]   = useState<string | null>(null);

  // Re-read token every render so effect dependency tracks real changes
  const { accessToken } = readAuth();

  useEffect(() => {
    // No token → don't connect (user is logged out)
    if (!accessToken) return;

    // Tear down any previous socket before creating a new one (JWT changed)
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(SOCKET_URL, {
      auth:      { token: accessToken },
      transports: ['websocket'],
      reconnection:         true,
      reconnectionAttempts: 5,
      reconnectionDelay:    2000,
    });

    socketRef.current = socket;

    // ── Connection lifecycle events ──
    socket.on('connect', () => {
      setConnected(true);
      setLastError(null);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      setConnected(false);
      setLastError(err.message);
    });

    socket.on('error', (payload: { message: string }) => {
      setLastError(payload?.message ?? 'Socket error');
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  // Re-run only when the JWT itself changes (reconnects automatically)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // ─────────────────────────────────────────────
  // Action emitters (stable references)
  // ─────────────────────────────────────────────

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('joinConversation', { conversationId });
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('leaveConversation', { conversationId });
  }, []);

  const sendMessage = useCallback((conversationId: string, content: string) => {
    socketRef.current?.emit('sendMessage', { conversationId, content });
  }, []);

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  // ─────────────────────────────────────────────
  // Subscription helpers — avoid duplicate listeners
  // via Socket.IO's per-listener off()
  // ─────────────────────────────────────────────

  const onNewMessage = useCallback((cb: NewMessageCallback) => {
    socketRef.current?.on('newMessage', cb);
    return () => { socketRef.current?.off('newMessage', cb); };
  }, []);

  const onMessageSent = useCallback((cb: NewMessageCallback) => {
    socketRef.current?.on('messageSent', cb);
    return () => { socketRef.current?.off('messageSent', cb); };
  }, []);

  const onTyping = useCallback((cb: TypingCallback) => {
    socketRef.current?.on('userTyping', cb);
    return () => {
      socketRef.current?.off('userTyping', cb);
    };
  }, []);

  return {
    connected,
    lastError,
    joinConversation,
    leaveConversation,
    sendMessage,
    emitTyping,
    onNewMessage,
    onMessageSent,
    onTyping,
  };
}
