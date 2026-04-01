import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useMessages } from '@/lib/api/hooks/useMessages';
import { useChatSocket } from '@/lib/chat/useChatSocket';
import { markRead } from '@/lib/api/chat';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Message } from '@/lib/api/chat';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function ChatThreadPage() {
  const router = useRouter();
  const { id } = router.query;
  const conversationId = typeof id === 'string' ? id : null;

  const { user } = useAuth();
  const myId = (user as any)?.id ?? (user as any)?.sub;

  const messagesQuery = useMessages(conversationId);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typingVisible, setTypingVisible] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync query data into local state
  useEffect(() => {
    const msgs = messagesQuery.data?.messages ?? [];
    if (msgs.length > 0) setLocalMessages(msgs);
  }, [messagesQuery.data]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  // Mark messages as read when thread opens
  useEffect(() => {
    const unread = localMessages
      .filter((m) => m.senderId !== myId && !m.readAt)
      .map((m) => m.id);
    if (unread.length > 0) markRead(unread).catch(() => {});
  }, [localMessages, myId]);

  const handleNewMessage = useCallback((msg: Message) => {
    setLocalMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleTyping = useCallback(({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
    if (userId === myId) return;
    setTypingVisible(isTyping);
    if (isTyping) {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingVisible(false), 3000);
    }
  }, [myId]);

  const { joinConversation, leaveConversation, sendMessage, emitTyping } = useChatSocket({
    onNewMessage: handleNewMessage,
    onTyping: handleTyping,
  });

  useEffect(() => {
    if (!conversationId) return;
    joinConversation(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || !conversationId) return;
    sendMessage(conversationId, content);
    setInput('');
    emitTyping(conversationId, false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (conversationId) {
      emitTyping(conversationId, e.target.value.length > 0);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        emitTyping(conversationId, false);
      }, 2000);
    }
  };

  // Group messages by date
  const groupedMessages: { label: string; messages: Message[] }[] = [];
  for (const msg of localMessages) {
    const label = formatDateLabel(msg.createdAt);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last?.label === label) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ label, messages: [msg] });
    }
  }

  const conversation = messagesQuery.data as any;
  const other = conversation?.renter?.id === myId ? conversation?.host : conversation?.renter;
  const booking = conversation?.booking;

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-gray-50">
        {/* ── Header ── */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <Link
            href="/messages"
            className="text-gray-500 hover:text-gray-900 transition p-1 rounded-lg hover:bg-gray-100"
          >
            <i className="fa-solid fa-arrow-left text-lg" />
          </Link>

          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {other?.name?.[0]?.toUpperCase() ?? '?'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{other?.name ?? 'Chat'}</p>
            {booking && (
              <p className="text-xs text-gray-500 truncate">
                {booking.listing?.title}
                {' · '}
                <span className={`font-medium ${
                  booking.status === 'confirmed' || booking.status === 'paid'
                    ? 'text-green-600'
                    : booking.status === 'pending'
                    ? 'text-blue-600'
                    : 'text-gray-500'
                }`}>
                  {booking.status === 'confirmed' || booking.status === 'paid'
                    ? 'Accepted'
                    : booking.status === 'pending'
                    ? 'Pending'
                    : booking.status}
                </span>
              </p>
            )}
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {messagesQuery.isLoading && (
            <div className="flex justify-center py-12">
              <i className="fa-solid fa-circle-notch fa-spin text-blue-400 text-2xl" />
            </div>
          )}

          {!messagesQuery.isLoading && localMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <i className="fa-solid fa-message text-blue-400 text-2xl" />
              </div>
              <p className="text-gray-500 font-medium">No messages yet</p>
              <p className="text-gray-400 text-sm mt-1">Send a message to start the conversation</p>
            </div>
          )}

          {groupedMessages.map((group) => (
            <div key={group.label}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium px-2">{group.label}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="space-y-2">
                {group.messages.map((msg) => {
                  const isMe = msg.senderId === myId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isMe && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {msg.sender?.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className={`max-w-xs lg:max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isMe
                              ? 'bg-blue-500 text-white rounded-br-md'
                              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md shadow-sm'
                          }`}
                        >
                          {msg.content}
                        </div>
                        <span className="text-xs text-gray-400 mt-1 px-1">
                          {formatTime(msg.createdAt)}
                          {isMe && msg.readAt && (
                            <i className="fa-solid fa-check-double ml-1 text-blue-400" />
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typingVisible && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center flex-shrink-0" />
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition max-h-32 overflow-y-auto"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-11 h-11 flex-shrink-0 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white disabled:text-gray-400 rounded-full flex items-center justify-center transition"
            >
              <i className="fa-solid fa-paper-plane text-sm" />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </Layout>
  );
}
