import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000; // every 60s — cheap; switch to WS later if needed

/**
 * Bell icon + dropdown panel. Renders nothing when the user isn't logged in.
 * Polls the unread count every 60s; opening the dropdown fetches the latest
 * 10 entries and marks them read on click.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-away to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadQ = useQuery({
    queryKey: ['notifications', 'unread-count'],
    enabled: !!user,
    refetchInterval: POLL_MS,
    queryFn: async () =>
      (await api.get('/notifications/unread-count')).data as { count: number },
  });

  const listQ = useQuery({
    queryKey: ['notifications', 'list'],
    enabled: !!user && open,
    queryFn: async () =>
      (await api.get('/notifications?limit=10')).data as NotificationItem[],
  });

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      /* swallow */
    }
  };

  const handleClickItem = async (n: NotificationItem) => {
    if (!n.readAt) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch {
        /* swallow — navigation should still proceed */
      }
    }
    setOpen(false);
  };

  if (!user) return null;

  const unread = unreadQ.data?.count ?? 0;
  const items = listQ.data ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Notifications (${unread} unread)`
            : 'Notifications'
        }
      >
        <i className="fa-regular fa-bell text-lg text-gray-700" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQ.isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                You're all caught up.
              </div>
            ) : (
              items.map((n) => (
                <NotificationRow key={n.id} n={n} onClick={() => handleClickItem(n)} />
              ))
            )}
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  n,
  onClick,
}: {
  n: NotificationItem;
  onClick: () => void;
}) {
  const icon = kindIcon(n.kind);
  const body = (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${icon.bg}`}>
        <i className={`text-sm ${icon.icon} ${icon.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${n.readAt ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
          {n.title}
        </p>
        {n.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
        ) : null}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
          {timeAgo(n.createdAt)}
        </p>
      </div>
      {!n.readAt ? (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      ) : null}
    </div>
  );

  if (n.link) {
    return (
      <Link href={n.link} onClick={onClick} className="block">
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {body}
    </button>
  );
}

function kindIcon(kind: string): { icon: string; color: string; bg: string } {
  const map: Record<string, { icon: string; color: string; bg: string }> = {
    BOOKING_REQUESTED: { icon: 'fa-solid fa-calendar-plus', color: 'text-blue-600', bg: 'bg-blue-100' },
    BOOKING_ACCEPTED:  { icon: 'fa-solid fa-circle-check',  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    BOOKING_REJECTED:  { icon: 'fa-solid fa-circle-xmark',  color: 'text-rose-600', bg: 'bg-rose-100' },
    BOOKING_PAID:      { icon: 'fa-solid fa-credit-card',   color: 'text-emerald-600', bg: 'bg-emerald-100' },
    BOOKING_CANCELLED: { icon: 'fa-solid fa-ban',           color: 'text-gray-600', bg: 'bg-gray-100' },
    BOOKING_COMPLETED: { icon: 'fa-solid fa-star',          color: 'text-amber-600', bg: 'bg-amber-100' },
    REVIEW_RECEIVED:   { icon: 'fa-solid fa-star',          color: 'text-amber-600', bg: 'bg-amber-100' },
    DISPUTE_OPENED:    { icon: 'fa-solid fa-triangle-exclamation', color: 'text-rose-600', bg: 'bg-rose-100' },
    DISPUTE_RESOLVED:  { icon: 'fa-solid fa-shield-halved', color: 'text-emerald-600', bg: 'bg-emerald-100' },
    DISPUTE_MESSAGE:   { icon: 'fa-regular fa-comment',     color: 'text-violet-600', bg: 'bg-violet-100' },
    KYC_APPROVED:      { icon: 'fa-solid fa-shield-check',  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    KYC_REJECTED:      { icon: 'fa-solid fa-id-card',       color: 'text-rose-600', bg: 'bg-rose-100' },
    PAYOUT_PAID:       { icon: 'fa-solid fa-coins',         color: 'text-emerald-600', bg: 'bg-emerald-100' },
  };
  return map[kind] ?? { icon: 'fa-regular fa-bell', color: 'text-gray-600', bg: 'bg-gray-100' };
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
