/**
 * DEV ONLY — delete after verification.
 * Open /dev/socket-smoke in two tabs (host + renter), join the same
 * conversationId, and messages should appear in both instantly.
 */
import { useState, useEffect, useRef } from 'react';
import { useChatSocket } from '@/lib/chat/useChatSocket';
import { readAuth } from '@/lib/auth/storage';
import type { Message } from '@/lib/api/chat';

// ── tiny style helpers ───────────────────────────────────────────────
const pill = (color: string, text: string) => (
  <span style={{
    display: 'inline-block', background: color, color: '#fff',
    borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 700,
  }}>{text}</span>
);

const pre = (value: unknown) => (
  <pre style={{
    background: '#0f1117', color: '#a8ff78', padding: 12,
    borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: '8px 0',
  }}>{JSON.stringify(value, null, 2)}</pre>
);

// ── main page ────────────────────────────────────────────────────────
export default function SocketSmokePage() {
  const { accessToken, user } = readAuth();
  if (!accessToken) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace' }}>
        <h1 style={{ color: '#dc2626' }}>Not logged in</h1>
        <p>Log in first, then revisit <code>/dev/socket-smoke</code>.</p>
        <a href="/auth/login" style={{ color: '#3b82f6' }}>→ Go to Login</a>
      </div>
    );
  }
  return <SmokePanel user={user} />;
}

function SmokePanel({ user }: { user: any }) {
  const { connected, lastError, joinConversation, leaveConversation, sendMessage, onNewMessage } =
    useChatSocket();

  const [convId,   setConvId]   = useState('');
  const [content,  setContent]  = useState('');
  const [joined,   setJoined]   = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to incoming messages — clean up when component unmounts
  useEffect(() => {
    const cleanup = onNewMessage((msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return cleanup;
  }, [onNewMessage]);

  // Auto-scroll on new message
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleJoin = () => {
    if (!convId.trim()) return;
    joinConversation(convId.trim());
    setJoined(true);
  };

  const handleLeave = () => {
    if (!convId.trim()) return;
    leaveConversation(convId.trim());
    setJoined(false);
    setMessages([]);
  };

  const handleSend = () => {
    const text = content.trim();
    if (!text || !convId.trim()) return;
    sendMessage(convId.trim(), text);
    setContent('');
  };

  const inputStyle: React.CSSProperties = {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', padding: '8px 12px', fontSize: 13, width: '100%',
    boxSizing: 'border-box',
  };

  const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
    background: disabled ? '#475569' : color, color: '#fff', border: 'none',
    borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
        🔌 Socket.IO Smoke Test
      </h1>
      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 24 }}>
        DELETE this page after verification — <code>frontend/src/pages/dev/socket-smoke.tsx</code>
      </p>

      {/* ── Connection status ── */}
      <div style={{ marginBottom: 24 }}>
        <strong>Connection:&nbsp;</strong>
        {connected
          ? pill('#16a34a', '✅ Connected')
          : pill('#dc2626', '❌ Disconnected')}
        {lastError && (
          <div style={{ marginTop: 8 }}>
            {pill('#b45309', `⚠️ Error: ${lastError}`)}
          </div>
        )}
      </div>

      {/* ── Logged-in user ── */}
      <div style={{ marginBottom: 24 }}>
        <strong>Logged in as:&nbsp;</strong>
        <code style={{ color: '#a5f3fc' }}>{user?.name ?? user?.email ?? '(unknown)'}</code>
        &nbsp;
        <code style={{ color: '#64748b', fontSize: 11 }}>({user?.id?.slice(0, 8)}…)</code>
      </div>

      {/* ── Join form ── */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Conversation ID (UUID)"
          value={convId}
          onChange={(e) => setConvId(e.target.value)}
          disabled={joined}
        />
        {!joined ? (
          <button style={btnStyle('#2563eb', !convId.trim())} onClick={handleJoin} disabled={!convId.trim()}>
            Join
          </button>
        ) : (
          <button style={btnStyle('#dc2626')} onClick={handleLeave}>
            Leave
          </button>
        )}
      </div>
      {joined && (
        <div style={{ marginBottom: 16 }}>
          {pill('#7c3aed', `🏠 Room: ${convId.slice(0, 8)}…`)}
        </div>
      )}

      {/* ── Send form ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder={joined ? 'Type a message and hit Send…' : 'Join a conversation first'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={!joined}
        />
        <button
          style={btnStyle('#16a34a', !joined || !content.trim())}
          onClick={handleSend}
          disabled={!joined || !content.trim()}
        >
          Send
        </button>
      </div>

      {/* ── Received messages ── */}
      <div>
        <strong style={{ fontSize: 13, color: '#94a3b8' }}>
          Received messages ({messages.length})
        </strong>
        <div
          ref={listRef}
          style={{
            marginTop: 8, maxHeight: 360, overflowY: 'auto',
            background: '#1e293b', borderRadius: 8, padding: 12,
          }}
        >
          {messages.length === 0 ? (
            <span style={{ color: '#475569', fontSize: 12 }}>
              No messages yet — send one from another tab.
            </span>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                  {new Date(m.createdAt).toLocaleTimeString()} ·{' '}
                  <code style={{ color: '#a5f3fc' }}>sender: {m.senderId.slice(0, 8)}…</code>
                </div>
                <div style={{
                  background: '#0f172a', border: '1px solid #334155',
                  borderRadius: 6, padding: '6px 10px', fontSize: 13,
                }}>{m.content}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Raw token hint ── */}
      <details style={{ marginTop: 24 }}>
        <summary style={{ color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
          Auth token (first 40 chars)
        </summary>
        {pre({ token: readAuth().accessToken?.slice(0, 40) + '…' })}
      </details>
    </div>
  );
}
