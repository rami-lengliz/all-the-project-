import Link from 'next/link';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { fetchConversations, fetchUnreadCount } from '@/lib/api/chat';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useChatSocket } from '@/lib/chat/useChatSocket';
import type { Conversation } from '@/lib/api/chat';

// ── helpers ───────────────────────────────────────────────────────────
function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.lastMessageAt ?? a.updatedAt).getTime();
    const tb = new Date(b.lastMessageAt ?? b.updatedAt).getTime();
    return tb - ta; // desc
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-slate-200 rounded w-1/3" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
      </div>
    </div>
  );
}

// ── Conversation row ──────────────────────────────────────────────────
function ConvRow({ conv, myId }: { conv: Conversation; myId: string }) {
  const other   = conv.renterId === myId ? conv.host : conv.renter;
  const name    = other?.name ?? conv.hostId ?? conv.renterId ?? 'Unknown';
  const initial = name[0]?.toUpperCase() ?? '?';
  const lastMsg = conv.messages?.[0];
  const preview = lastMsg
    ? (lastMsg.senderId === myId ? 'You: ' : '') + lastMsg.content
    : 'No messages yet';
  const ts      = conv.lastMessageAt ?? conv.updatedAt;
  const unread  = (conv.unreadCount ?? 0) > 0;

  return (
    <Link
      href={`/messages/${conv.id}`}
      className="flex items-center gap-3 px-4 py-4 border-b border-slate-100
                 hover:bg-slate-50 transition-colors cursor-pointer no-underline"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700
                        flex items-center justify-center text-white font-semibold text-base">
          {initial}
        </div>
        {unread && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full
                           border-2 border-white" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={`text-sm truncate ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>
            {name}
          </p>
          <span className="text-xs text-slate-400 shrink-0">{timeAgo(ts)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate ${unread ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
            {preview}
          </p>
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500
                             text-white text-[10px] font-bold flex items-center justify-center">
              {conv.unreadCount! > 9 ? '9+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Left panel (conversation list) ───────────────────────────────────
function ConversationList({ myId }: { myId: string }) {
  // Conversations — 5s polling
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn:  fetchConversations,
    refetchInterval:      5_000,
    refetchOnWindowFocus: true,   // re-fetches when user returns from thread page
    staleTime:            4_000,
    retry: 1,
  });

  // Global unread count — 5s polling (backend doesn't compute per-conversation unread)
  const { data: totalUnread = 0 } = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn:  fetchUnreadCount,
    refetchInterval:      5_000,
    refetchOnWindowFocus: true,   // badge updates immediately on tab/page focus
    staleTime:            4_000,
  });

  const queryClient = useQueryClient();
  const { onNewMessage, socketVersion } = useChatSocket();

  // Real-time invalidation: when any new message arrives, immediately
  // refresh both the conversation list and the unread badge.
  // The 5s poll remains as fallback for when the socket is offline.
  useEffect(() => {
    const cleanup = onNewMessage(() => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    });
    return cleanup;
  }, [onNewMessage, queryClient, socketVersion]);

  const sorted = sortConversations(data ?? []);

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-4 py-5 border-b border-slate-200 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Messages</h1>
        <div className="flex items-center gap-2">
          {/* Global unread badge — sourced from GET /api/chat/unread-count (5s poll) */}
          {totalUnread > 0 && (
            <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full"
                  title={`${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
          {sorted.length > 0 && (
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
              {sorted.length}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-slate-500 text-sm mb-3">Failed to load conversations.</p>
            <button
              onClick={() => void refetch()}
              className="text-sm text-blue-500 underline hover:text-blue-700"
            >
              Retry
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="font-semibold text-slate-700 mb-1">No messages yet</p>
            <p className="text-slate-400 text-sm mb-5">
              Your conversations appear here once a booking is created.
            </p>
            <Link
              href="/search"
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium
                         px-5 py-2.5 rounded-xl transition-colors no-underline"
            >
              Browse listings
            </Link>
          </div>
        ) : (
          sorted.map((conv) => (
            <ConvRow key={conv.id} conv={conv} myId={myId} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Right panel empty state ───────────────────────────────────────────
function EmptyPane() {
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full
                    bg-slate-50 border-l border-slate-200">
      <div className="text-5xl mb-4">💬</div>
      <p className="font-semibold text-slate-700 mb-1">Select a conversation</p>
      <p className="text-slate-400 text-sm">Choose a conversation from the list to start messaging.</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function MessagesInboxPage() {
  const { user } = useAuth();
  const myId: string = (user as any)?.id ?? (user as any)?.sub ?? '';

  return (
    <Layout>
      {/*
        Desktop: 2-column split pane
        Mobile:  list fills full width
      */}
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Left — conversation list */}
        <div className="w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden flex flex-col">
          <ConversationList myId={myId} />
        </div>

        {/* Right — empty state (desktop only; on mobile user navigates to /messages/:id) */}
        <div className="flex-1">
          <EmptyPane />
        </div>
      </div>
    </Layout>
  );
}
