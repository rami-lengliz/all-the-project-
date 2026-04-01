import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { readAuth } from '@/lib/auth/storage';
import { API_URL } from '@/lib/api/env';
import type { Message } from '@/lib/api/chat';

interface UseChatSocketOptions {
  onNewMessage?: (msg: Message) => void;
  onTyping?: (payload: { userId: string; isTyping: boolean }) => void;
}

export function useChatSocket(opts: UseChatSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const onNewMessageRef = useRef(opts.onNewMessage);
  const onTypingRef = useRef(opts.onTyping);

  // Keep refs up-to-date without re-connecting
  useEffect(() => { onNewMessageRef.current = opts.onNewMessage; }, [opts.onNewMessage]);
  useEffect(() => { onTypingRef.current = opts.onTyping; }, [opts.onTyping]);

  useEffect(() => {
    const { accessToken } = readAuth();

    const socket = io(`${API_URL}/chat`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('newMessage', (msg: Message) => {
      onNewMessageRef.current?.(msg);
    });

    socket.on('userTyping', (payload: { userId: string; isTyping: boolean }) => {
      onTypingRef.current?.(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // connect once on mount

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

  return { joinConversation, leaveConversation, sendMessage, emitTyping };
}
