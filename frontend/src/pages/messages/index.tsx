import Link from 'next/link';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { useConversations } from '@/lib/api/hooks/useConversations';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Conversation } from '@/lib/api/chat';

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
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
    case 'cancelled':
      return { label: status === 'rejected' ? 'Rejected' : 'Cancelled', cls: 'bg-red-100 text-red-700' };
    default:
      return null;
  }
}

function ConversationRow({ conv, myId }: { conv: Conversation; myId: string }) {
  const other = conv.renterId === myId ? conv.host : conv.renter;
  const lastMsg = conv.messages?.[0];
  const pill = statusPill(conv.booking?.status);

  return (
    <Link
      href={`/messages/${conv.id}`}
      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition border-b border-gray-100 last:border-0"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
        {other?.name?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="font-semibold text-gray-900 truncate">{other?.name ?? 'Unknown'}</p>
          <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{timeAgo(conv.lastMessageAt)}</span>
        </div>

        {conv.booking && (
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-gray-500 truncate">{conv.booking.listing?.title}</p>
            {pill && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${pill.cls}`}>
                {pill.label}
              </span>
            )}
          </div>
        )}

        <p className="text-sm text-gray-500 truncate">
          {lastMsg
            ? (lastMsg.senderId === myId ? 'You: ' : '') + lastMsg.content
            : 'No messages yet'}
        </p>
      </div>

      <i className="fa-solid fa-chevron-right text-gray-300 flex-shrink-0 text-sm" />
    </Link>
  );
}

export default function MessagesInboxPage() {
  const router = useRouter();
  const { user } = useAuth();
  const myId = (user as any)?.id ?? (user as any)?.sub;
  const { data: conversations = [], isLoading } = useConversations();

  return (
    <Layout>
      <div className="max-w-2xl mx-auto min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-6 py-5 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            {conversations.length > 0 && (
              <span className="bg-blue-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                {conversations.length}
              </span>
            )}
          </div>
        </div>

        {/* List */}
        <div className="bg-white shadow-sm">
          {isLoading ? (
            <div className="space-y-0">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-100 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-6">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <i className="fa-solid fa-message text-blue-300 text-3xl" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h2>
              <p className="text-gray-500 text-sm mb-6">Your conversations will appear here after you make a booking.</p>
              <Link
                href="/search"
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-3 rounded-xl transition"
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
      </div>
    </Layout>
  );
}
