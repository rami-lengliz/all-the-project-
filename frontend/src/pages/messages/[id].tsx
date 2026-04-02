import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useMessages } from '@/lib/api/hooks/useMessages';
import { useChatSocket } from '@/lib/chat/useChatSocket';
import { markRead } from '@/lib/api/chat';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Message } from '@/lib/api/chat';

// ─── helpers ────────────────────────────────────────────────────────
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

// ─── page ────────────────────────────────────────────────────────────
export default function ChatThreadPage() {
  const router = useRouter();
  const { id } = router.query;
  const conversationId = typeof id === 'string' ? id : '';

  const { user } = useAuth();
  const myId: string = (user as any)?.id ?? (user as any)?.sub ?? '';

  // ── REST: load message history ──────────────────────────────────
  const messagesQuery = useMessages(conversationId);

  // ── local message state (merge REST history + real-time) ────────
  const [messages, setMessages] = useState<Message[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const appendMessage = useCallback((msg: Message) => {
    if (seenIds.current.has(msg.id)) return; // deduplicate by id
    seenIds.current.add(msg.id);
    // Sort by createdAt so socket messages that arrive out-of-order are placed correctly
    setMessages((prev) =>
      [...prev, msg].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    );
  }, []);

  // Seed from REST on first load
  useEffect(() => {
    const loaded = messagesQuery.data?.messages ?? [];
    if (loaded.length === 0) return;
    seenIds.current.clear();
    const deduped: Message[] = [];
    for (const m of loaded) {
      if (!seenIds.current.has(m.id)) {
        seenIds.current.add(m.id);
        deduped.push(m);
      }
    }
    setMessages(deduped);
  }, [messagesQuery.data]);

  // ── Mark unread as read (once, when history first loads) ───────────
  // Stamps readAt locally so read-receipt ✓✓ renders immediately.
  const markedOnLoad = useRef(false);
  useEffect(() => {
    if (markedOnLoad.current || messages.length === 0) return;
    const unread = messages
      .filter((m) => m.senderId !== myId && !m.readAt)
      .map((m) => m.id);
    if (unread.length === 0) return;
    markedOnLoad.current = true;
    markRead(unread)
      .then(() => {
        const now = new Date().toISOString();
        const idSet = new Set(unread);
        setMessages((prev) =>
          prev.map((m) => (idSet.has(m.id) ? { ...m, readAt: now } : m)),
        );
      })
      .catch((err: any) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('[markRead] on-load failed:', err?.response?.status, err?.message);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, myId]); // length-dep: fires when first batch arrives

  // ── Socket ───────────────────────────────────────────────────────
  const {
    joinConversation,
    leaveConversation,
    sendMessage: socketSend,
    emitTyping,
    onNewMessage,
    onMessageSent,
    onTyping,
    socketVersion,
  } = useChatSocket();

  // Join / leave room on mount (and re-join if socket reconnects)
  useEffect(() => {
    if (!conversationId) return;
    joinConversation(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation, socketVersion]);

  // Listen for new messages from the OTHER user
  useEffect(() => {
    const cleanup = onNewMessage((msg) => {
      appendMessage(msg);
      if (msg.senderId !== myId) {
        markRead([msg.id]).catch((err: any) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('[markRead] incoming msg failed:', err?.response?.status);
          }
        });
      }
    });
    return cleanup;
  }, [onNewMessage, appendMessage, myId, socketVersion]); // socketVersion: re-register on reconnect

  // messageSent — backend echoes the saved message back to the sender
  useEffect(() => {
    const cleanup = onMessageSent(appendMessage);
    return cleanup;
  }, [onMessageSent, appendMessage, socketVersion]);

  // ── Typing state ────────────────────────────────────────────────
  const [otherTyping, setOtherTyping] = useState(false);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cleanup = onTyping(({ userId, conversationId: cid, isTyping }) => {
      if (userId === myId) return;
      if (cid !== conversationId) return;
      setOtherTyping(isTyping);
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
      if (isTyping) {
        typingClearTimer.current = setTimeout(() => setOtherTyping(false), 3000);
      }
    });
    return cleanup;
  }, [onTyping, myId, conversationId, socketVersion]);

  // ── Scroll to bottom ────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  // ── Input + typing emit ─────────────────────────────────────────
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Two separate timers:
  // typingStartTimer — debounce before emitting typing:true  (400ms)
  // typingStopTimer  — idle timeout before emitting typing:false (1200ms)
  const typingStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup both timers on unmount to prevent emitting after navigation
  useEffect(() => {
    return () => {
      if (typingStartTimer.current) clearTimeout(typingStartTimer.current);
      if (typingStopTimer.current)  clearTimeout(typingStopTimer.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (!conversationId) return;

    // Debounce typing:true — don't spam on every keystroke
    if (!typingStartTimer.current) {
      typingStartTimer.current = setTimeout(() => {
        emitTyping(conversationId, true);
        typingStartTimer.current = null;
      }, 400);
    }

    // Reset idle timer — emit typing:false after 1200ms of no input
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      emitTyping(conversationId, false);
      typingStopTimer.current = null;
      // Also cancel the start debounce if user stopped before it fired
      if (typingStartTimer.current) {
        clearTimeout(typingStartTimer.current);
        typingStartTimer.current = null;
      }
    }, 1200);
  };

  // ── Send ────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || !conversationId) return;

    socketSend(conversationId, content);
    setInput('');

    // Cancel both timers and emit typing:false immediately on send
    if (typingStartTimer.current) { clearTimeout(typingStartTimer.current); typingStartTimer.current = null; }
    if (typingStopTimer.current)  { clearTimeout(typingStopTimer.current);  typingStopTimer.current  = null; }
    emitTyping(conversationId, false);

    inputRef.current?.focus();
  }, [input, conversationId, socketSend, emitTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Group messages by date ──────────────────────────────────────
  const grouped: { label: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const label = formatDateLabel(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last?.label === label) {
      last.msgs.push(msg);
    } else {
      grouped.push({ label, msgs: [msg] });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>

        {/* ── Header ── */}
        <header style={{
          background: '#fff', borderBottom: '1px solid #e2e8f0',
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <Link
            href="/messages"
            style={{ color: '#64748b', textDecoration: 'none', fontSize: 18, padding: '4px 8px', borderRadius: 8 }}
          >
            ←
          </Link>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: 15 }}>
              Conversation
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
              {conversationId ? `${conversationId.slice(0, 8)}…` : '—'}
            </p>
          </div>
        </header>

        {/* ── Messages ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>

          {/* Loading */}
          {messagesQuery.isLoading && (
            <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40 }}>Loading…</p>
          )}

          {/* Error */}
          {messagesQuery.isError && (
            <p style={{ textAlign: 'center', color: '#ef4444', marginTop: 40 }}>
              Failed to load messages.{' '}
              <button
                onClick={() => void messagesQuery.refetch()}
                style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Retry
              </button>
            </p>
          )}

          {/* Empty */}
          {!messagesQuery.isLoading && messages.length === 0 && (
            <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 60 }}>
              No messages yet — say hello!
            </p>
          )}

          {/* Grouped by date */}
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date separator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{group.label}</span>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>

              {group.msgs.map((msg) => {
                const isMe = msg.senderId === myId;
                return (
                  <div key={msg.id} style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 8,
                  }}>
                    <div style={{ maxWidth: '70%' }}>
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: isMe ? '#3b82f6' : '#fff',
                        color: isMe ? '#fff' : '#0f172a',
                        border: isMe ? 'none' : '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        fontSize: 14,
                        lineHeight: '1.5',
                        wordBreak: 'break-word',
                      }}>
                        {msg.content}
                      </div>
                      <div style={{
                        fontSize: 10, color: '#94a3b8', marginTop: 3,
                        textAlign: isMe ? 'right' : 'left', paddingInline: 4,
                      }}>
                        {formatTime(msg.createdAt)}
                        {isMe && msg.readAt && ' · ✓✓'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Typing indicator */}
          {otherTyping && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 4 }}>
              <div style={{
                background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: '18px 18px 18px 4px',
                padding: '10px 14px', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                <DotDot />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div style={{
          background: '#fff', borderTop: '1px solid #e2e8f0',
          padding: '12px 16px',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: 800, margin: '0 auto' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              style={{
                flex: 1, resize: 'none', borderRadius: 20,
                border: '1px solid #cbd5e1', padding: '10px 16px',
                fontSize: 14, color: '#0f172a', outline: 'none',
                fontFamily: 'inherit', lineHeight: '1.5', maxHeight: 120,
                overflowY: 'auto', boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.border = '1px solid #3b82f6'; }}
              onBlur={(e) => { e.target.style.border = '1px solid #cbd5e1'; }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                width: 42, height: 42, borderRadius: '50%', border: 'none',
                background: input.trim() ? '#3b82f6' : '#e2e8f0',
                color: input.trim() ? '#fff' : '#94a3b8',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0, transition: 'background 0.15s',
              }}
              aria-label="Send message"
            >
              ➤
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#cbd5e1', margin: '6px 0 0' }}>
            Enter to send · Shift+Enter for new line
          </p>
        </div>

      </div>
    </Layout>
  );
}

// ── Typing dots animation ─────────────────────────────────────────
function DotDot() {
  return (
    <>
      {[0, 150, 300].map((delay, i) => (
        <span
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%', background: '#94a3b8',
            display: 'inline-block',
            animation: 'bounce 1.2s infinite',
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
