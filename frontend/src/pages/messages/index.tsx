import { useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { useConversations } from '@/lib/api/hooks/useConversations';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useChatSocket } from '@/lib/chat/useChatSocket';
import type { Conversation } from '@/lib/api/chat';

// ── helpers ──────────────────────────────────────────────────────────
function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function statusPill(status?: string) {
  switch (status) {
    case 'confirmed':
    case 'paid':
      return { label: 'Accepted', cls: 'bg-green-100 text-green-700' };
    case 'pending':
      return { label: 'Pending', cls: 'bg-blue-100 text-blue-700' };
    case 'rejected':
      return { label: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'cancelled':
      return { label: 'Cancelled', cls: 'bg-red-100 text-red-700' };
    default:
      return null;
  }
}

// ── Conversation row ─────────────────────────────────────────────────
function ConversationRow({ conv, myId }: { conv: Conversation; myId: string }) {
  const other   = conv.renterId === myId ? conv.host : conv.renter;
  const lastMsg = conv.messages?.[0];
  const pill    = statusPill(conv.booking?.status);

  // Unread dot: message exists, wasn't sent by me, and has no readAt
  const hasUnread = !!lastMsg && lastMsg.senderId !== myId && !lastMsg.readAt;

  return (
    <Link
      href={`/messages/${conv.id}`}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
               textDecoration: 'none', borderBottom: '1px solid #f1f5f9',
               transition: 'background 0.1s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Avatar */}
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 18, flexShrink: 0,
        position: 'relative',
      }}>
        {other?.name?.[0]?.toUpperCase() ?? '?'}
        {/* Unread dot */}
        {hasUnread && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            width: 12, height: 12, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #fff',
          }} />
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <p style={{ margin: 0, fontWeight: hasUnread ? 700 : 600, color: '#0f172a',
                      fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {other?.name ?? 'Unknown'}
          </p>
          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>
            {timeAgo(conv.lastMessageAt)}
          </span>
        </div>

        {conv.booking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.booking.listing?.title}
            </p>
            {pill && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px',
                             borderRadius: 99, flexShrink: 0 }}
                    className={pill.cls}>
                {pill.label}
              </span>
            )}
          </div>
        )}

        <p style={{ margin: 0, fontSize: 13,
                    color: hasUnread ? '#0f172a' : '#64748b',
                    fontWeight: hasUnread ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastMsg
            ? (lastMsg.senderId === myId ? 'You: ' : '') + lastMsg.content
            : 'No messages yet'}
        </p>
      </div>

      <span style={{ color: '#cbd5e1', fontSize: 12, flexShrink: 0 }}>›</span>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function MessagesInboxPage() {
  const { user } = useAuth();
  const myId = (user as any)?.id ?? (user as any)?.sub ?? '';

  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading, isError, refetch } = useConversations();

  // Live update: when any newMessage arrives while on inbox, invalidate conversations
  // so the preview row refreshes without a full reload.
  const { onNewMessage } = useChatSocket();
  useEffect(() => {
    const cleanup = onNewMessage(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    return cleanup;
  }, [onNewMessage, queryClient]);

  return (
    <Layout>
      <div style={{ maxWidth: 640, margin: '0 auto', minHeight: '100vh', background: '#fff' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0',
                      position: 'sticky', top: 0, zIndex: 10, padding: '20px 24px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Messages</h1>
          {conversations.length > 0 && (
            <span style={{ background: '#3b82f6', color: '#fff', fontSize: 12,
                           fontWeight: 700, padding: '2px 10px', borderRadius: 99 }}>
              {conversations.length}
            </span>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          // Skeleton
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 14, background: '#e2e8f0', borderRadius: 6, width: '35%', marginBottom: 8 }} />
                  <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '60%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <p style={{ color: '#ef4444', marginBottom: 12 }}>Failed to load conversations.</p>
            <button
              onClick={() => void refetch()}
              style={{ color: '#3b82f6', background: 'none', border: '1px solid #3b82f6',
                       borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}
            >
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#eff6ff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          margin: '0 auto 16px', fontSize: 28 }}>
              💬
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>No messages yet</h2>
            <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
              Your conversations will appear here after you make a booking.
            </p>
            <Link
              href="/search"
              style={{ background: '#3b82f6', color: '#fff', textDecoration: 'none',
                       fontWeight: 600, padding: '10px 24px', borderRadius: 12, fontSize: 14 }}
            >
              Browse listings
            </Link>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} myId={myId} />
          ))
        )}

      </div>
    </Layout>
  );
}
