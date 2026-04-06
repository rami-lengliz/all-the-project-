/**
 * DEV ONLY — delete after verification.
 * Open /dev/chat-smoke to confirm chat REST endpoints work with auth.
 */
import { readAuth } from '@/lib/auth/storage';
import { useConversations } from '@/lib/api/hooks/useConversations';
import { useMessages } from '@/lib/api/hooks/useMessages';

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </h2>
      {children}
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre style={{
      background: '#0f1117',
      color: '#a8ff78',
      padding: 16,
      borderRadius: 8,
      fontSize: 12,
      overflowX: 'auto',
      maxHeight: 360,
      overflowY: 'auto',
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Status({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      display: 'inline-block',
      background: color,
      color: '#fff',
      borderRadius: 4,
      padding: '2px 10px',
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 8,
    }}>
      {label}
    </div>
  );
}

function MessagesPanel({ conversationId }: { conversationId: string }) {
  const msgs = useMessages(conversationId);
  return (
    <Block label={`Messages — conversation ${conversationId.slice(0, 8)}…`}>
      {msgs.isLoading && <Status label="⏳ Loading messages…" color="#2563eb" />}
      {msgs.isError  && <Status label={`❌ Error: ${(msgs.error as any)?.message}`} color="#dc2626" />}
      {msgs.isSuccess && <Status label={`✅ ${msgs.data.messages.length} messages (total: ${msgs.data.total})`} color="#16a34a" />}
      {msgs.data && <Json value={msgs.data} />}
    </Block>
  );
}

export default function ChatSmokePage() {
  // Simple token check (no RouteGuard needed for a dev page)
  const { accessToken } = readAuth();
  if (!accessToken) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace' }}>
        <h1 style={{ color: '#dc2626' }}>Not logged in</h1>
        <p>Log in first then revisit <code>/dev/chat-smoke</code>.</p>
        <a href="/auth/login" style={{ color: '#2563eb' }}>→ Go to Login</a>
      </div>
    );
  }

  return <AuthedSmokePanel />;
}

function AuthedSmokePanel() {
  const convs = useConversations();
  const firstId = convs.data?.[0]?.id ?? '';

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', background: '#1a1a2e', minHeight: '100vh', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
        🛰️ Chat REST Smoke Test
      </h1>
      <p style={{ color: '#64748b', marginBottom: 32, fontSize: 13 }}>
        DELETE this page after verification — <code>frontend/src/pages/dev/chat-smoke.tsx</code>
      </p>

      {/* ── Conversations block ── */}
      <Block label="GET /api/chat/conversations">
        {convs.isLoading && <Status label="⏳ Loading…" color="#2563eb" />}
        {convs.isError   && (
          <>
            <Status label={`❌ Error: ${(convs.error as any)?.message}`} color="#dc2626" />
            <Json value={(convs.error as any)?.response?.data ?? (convs.error as any)?.message} />
          </>
        )}
        {convs.isSuccess && (
          <Status
            label={convs.data.length === 0 ? '✅ 200 OK — 0 conversations' : `✅ 200 OK — ${convs.data.length} conversation(s)`}
            color="#16a34a"
          />
        )}
        {convs.data && <Json value={convs.data} />}
      </Block>

      {/* ── Messages block (only if at least 1 conversation) ── */}
      {firstId ? (
        <MessagesPanel conversationId={firstId} />
      ) : convs.isSuccess ? (
        <Block label="Messages">
          <Status label="ℹ️ No conversations yet — create a booking first to generate one" color="#d97706" />
        </Block>
      ) : null}

      {/* ── Auth debug ── */}
      <Block label="Auth token (first 40 chars)">
        <Json value={{ token: readAuth().accessToken?.slice(0, 40) + '…' }} />
      </Block>
    </div>
  );
}
