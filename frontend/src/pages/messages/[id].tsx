import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { useMessages } from '@/lib/api/hooks/useMessages';
import { useConversations } from '@/lib/api/hooks/useConversations';
import { useChatSocket } from '@/lib/chat/useChatSocket';
import { markRead } from '@/lib/api/chat';
import { useAuth } from '@/lib/auth/AuthProvider';
import { api } from '@/lib/api/http';
import { useWallet } from '@/lib/api/hooks/useWallet';
import type { Message } from '@/lib/api/chat';
import { API_URL } from '@/lib/api/env';
import { detectContact } from '@/lib/anti-leak/detectContact';

// ─── BookingCardImage ────────────────────────────────────────────────
// Shows the snapshot image from the BOOKING_CARD message. If that path is
// broken (demo listings, stale uploads), falls back to the listing's live
// first image fetched from the API.
function BookingCardImage({ listingId, storedImage, title }: {
  listingId: string;
  storedImage: string | null;
  title: string;
}) {
  const [useLive, setUseLive] = useState(!storedImage);

  const { data: liveImages } = useQuery<string[]>({
    queryKey: ['listing-images', listingId],
    queryFn: async () => {
      const res = await api.get(`/listings/${listingId}`);
      return (res.data?.images ?? []) as string[];
    },
    enabled: useLive,
    staleTime: 5 * 60_000,
  });

  const resolveUrl = (path: string) =>
    path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const liveFirst = liveImages?.[0] ?? null;
  const src = useLive ? (liveFirst ? resolveUrl(liveFirst) : null) : (storedImage ? resolveUrl(storedImage) : null);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={title}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => {
          e.currentTarget.onerror = null;
          if (!useLive) {
            setUseLive(true);
          } else {
            e.currentTarget.src = '/placeholder.png';
          }
        }}
      />
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 40 }}>🏠</span>
    </div>
  );
}

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

// ─── Wallet-first payment panel (renter, confirmed booking) ──────────
function RenterPayActions({
  bookingId,
  publicTotal,
  walletTotal,
  walletDiscount,
}: {
  bookingId: string;
  publicTotal: number;
  walletTotal: number;
  walletDiscount: number;
}) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const { data: walletData } = useWallet();
  const balance = Number((walletData as any)?.balance ?? 0);
  const canPayWithWallet = balance >= walletTotal;
  const missing = walletTotal - balance;

  const payWithWallet = async () => {
    setPaying(true);
    setPayError(null);
    try {
      await api.post(`/bookings/${bookingId}/pay`, { useWallet: true });
      void qc.invalidateQueries({ queryKey: ['booking-chat', bookingId] });
      void qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    } catch (e: any) {
      setPayError(e?.response?.data?.message ?? 'Payment failed. Try again.');
    } finally {
      setPaying(false);
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, marginBottom: 3,
  };

  return (
    <div style={{ marginTop: 8 }}>
      {/* Pricing breakdown */}
      <div style={{ marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
        <div style={{ ...rowStyle, color: '#64748b' }}>
          <span>Total price</span>
          <span>TND {publicTotal.toFixed(2)}</span>
        </div>
        <div style={{ ...rowStyle, color: '#16a34a' }}>
          <span>Wallet discount</span>
          <span>−TND {walletDiscount.toFixed(2)}</span>
        </div>
        <div style={{ ...rowStyle, color: '#0f172a', fontWeight: 700 }}>
          <span>Wallet price</span>
          <span>TND {walletTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Wallet balance row */}
      <div style={{ ...rowStyle, color: '#64748b', marginBottom: 6 }}>
        <span>Wallet balance</span>
        <span style={{ fontWeight: 700, color: canPayWithWallet ? '#16a34a' : '#ef4444' }}>
          TND {balance.toFixed(2)}
        </span>
      </div>

      {canPayWithWallet ? (
        <button
          onClick={payWithWallet}
          disabled={paying}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
            background: paying ? '#15803d99' : '#16a34a',
            color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: paying ? 'wait' : 'pointer', marginBottom: 6, display: 'block',
          }}
        >
          {paying ? '⏳ Processing…' : `💰 Pay TND ${walletTotal.toFixed(2)} — Save TND ${walletDiscount.toFixed(2)}`}
        </button>
      ) : (
        <Link
          href="/client/wallet"
          style={{
            display: 'block', padding: '9px 0', borderRadius: 10, marginBottom: 6,
            background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 13,
            textAlign: 'center', textDecoration: 'none',
          }}
        >
          ⬆ Top up wallet (TND {missing.toFixed(2)} short)
        </Link>
      )}

      <Link
        href={`/booking/${bookingId}/pay`}
        style={{
          display: 'block', padding: '8px 0', borderRadius: 10,
          border: '1.5px solid #3b82f6', color: '#3b82f6', fontWeight: 600, fontSize: 13,
          textAlign: 'center', textDecoration: 'none',
        }}
      >
        💳 Pay TND {publicTotal.toFixed(2)} with Konnect
      </Link>

      {payError && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', textAlign: 'center' }}>
          {payError}
        </div>
      )}
    </div>
  );
}

// ─── Booking details modal (host-only) ───────────────────────────────
interface HostDetails {
  bookingId: string;
  status: string;
  displayStatus: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  publicTotal: number;
  hostAmount: number;
  listing: { id: string; title: string | null; category: string | null; bookingType: string | null };
  renter: {
    id: string; name: string; avatarUrl: string | null;
    verifiedEmail: boolean; verifiedPhone: boolean;
    ratingAvg: number; ratingCount: number;
    createdAt: string; completedBookings: number;
  };
}

function BookingDetailsModal({
  bookingId,
  onClose,
  onAccept,
  onDecline,
  canAct,
  acting,
}: {
  bookingId: string;
  onClose: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  canAct: boolean;
  acting: 'accept' | 'decline' | null;
}) {
  const { data, isLoading, isError } = useQuery<HostDetails>({
    queryKey: ['host-details', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const res = await api.get(`/bookings/${bookingId}/host-details`);
      return res.data?.data ?? res.data;
    },
    staleTime: 30_000,
  });

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'flex-end', justifyContent: 'center',
  };
  const sheet: React.CSSProperties = {
    background: '#fff', width: '100%', maxWidth: 480,
    maxHeight: '90vh', overflowY: 'auto',
    borderRadius: '20px 20px 0 0', padding: '20px 20px 32px',
  };
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 13, marginBottom: 5, color: '#475569',
  };
  const label: React.CSSProperties = { fontWeight: 600, color: '#64748b' };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>Booking details</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>✕</button>
        </div>

        {isLoading && <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>Loading…</p>}
        {isError && <p style={{ textAlign: 'center', color: '#ef4444', padding: '24px 0' }}>Could not load details.</p>}

        {data && (
          <>
            {/* Renter profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 12 }}>
              {data.renter.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.renter.avatarUrl} alt={data.renter.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
                  {data.renter.name[0]?.toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{data.renter.name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                  {data.renter.verifiedEmail && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', borderRadius: 10, padding: '1px 7px' }}>✓ Email</span>
                  )}
                  {data.renter.verifiedPhone && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', borderRadius: 10, padding: '1px 7px' }}>✓ Phone</span>
                  )}
                  {!data.renter.verifiedEmail && !data.renter.verifiedPhone && (
                    <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⚠ Unverified account</span>
                  )}
                </div>
              </div>
              {data.renter.ratingCount > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>⭐ {data.renter.ratingAvg.toFixed(1)}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{data.renter.ratingCount} review{data.renter.ratingCount !== 1 ? 's' : ''}</div>
                </div>
              )}
            </div>

            {/* Renter stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{data.renter.completedBookings}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>completed bookings</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {new Date(data.renter.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>member since</div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#e2e8f0', marginBottom: 14 }} />

            {/* Listing & dates */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 8 }}>{data.listing.title}</div>
              {data.listing.category && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', background: '#eff6ff', borderRadius: 20, padding: '2px 8px', display: 'inline-block', marginBottom: 8 }}>
                  {data.listing.category}
                </span>
              )}
              <div style={row}><span style={label}>Check-in</span><span>{fmtDate(data.startDate)}{data.startTime ? ` · ${data.startTime}` : ''}</span></div>
              <div style={row}><span style={label}>Check-out</span><span>{fmtDate(data.endDate)}{data.endTime ? ` · ${data.endTime}` : ''}</span></div>
              <div style={row}><span style={label}>Status</span><span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{data.displayStatus}</span></div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#e2e8f0', marginBottom: 14 }} />

            {/* Amounts */}
            <div style={{ marginBottom: 16 }}>
              <div style={row}><span style={label}>Total charged to renter</span><span style={{ fontWeight: 700 }}>TND {data.publicTotal.toFixed(2)}</span></div>
              <div style={row}><span style={label}>Your payout</span><span style={{ fontWeight: 700, color: '#16a34a' }}>TND {data.hostAmount.toFixed(2)}</span></div>
            </div>

            {/* Accept / Decline from modal */}
            {canAct && onAccept && onDecline && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => { onAccept(); onClose(); }}
                  disabled={acting !== null}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: acting ? '#15803d99' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: acting ? 'wait' : 'pointer' }}
                >
                  {acting === 'accept' ? '⏳ Accepting…' : '✅ Accept'}
                </button>
                <button
                  onClick={() => { onDecline(); onClose(); }}
                  disabled={acting !== null}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #ef4444', background: '#fff', color: '#ef4444', fontWeight: 700, fontSize: 14, cursor: acting ? 'wait' : 'pointer' }}
                >
                  {acting === 'decline' ? '⏳ Declining…' : '✕ Decline'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Booking card action buttons ─────────────────────────────────────
function BookingCardActions({ bookingId, myId }: { bookingId: string; myId: string }) {
  const qc = useQueryClient();
  const [acting, setActing] = useState<'accept' | 'decline' | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking-chat', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const res = await api.get(`/bookings/${bookingId}`);
      return res.data as {
        id: string; status: string; hostId: string; renterId: string;
        totalPrice: number; snapshotCommissionRate?: number;
      };
    },
    staleTime: 10_000,
  });

  if (!bookingId || isLoading || !booking) return null;

  const isHost = booking.hostId === myId;
  const isRenter = booking.renterId === myId;
  const status = booking.status;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['booking-chat', bookingId] });

  const accept = async () => {
    setActing('accept');
    try {
      await api.patch(`/bookings/${bookingId}/confirm`);
      await invalidate();
    } catch { /* system message will confirm */ } finally { setActing(null); }
  };

  const decline = async () => {
    setActing('decline');
    try {
      await api.patch(`/bookings/${bookingId}/reject`);
      await invalidate();
    } catch { /* ignore */ } finally { setActing(null); }
  };

  const viewDetailsBtn = (
    <button
      onClick={() => setShowDetails(true)}
      style={{
        width: '100%', padding: '7px 0', borderRadius: 10,
        border: '1.5px solid #cbd5e1', background: '#f8fafc',
        color: '#475569', fontWeight: 600, fontSize: 13,
        cursor: 'pointer', marginTop: 6,
      }}
    >
      🔍 View details
    </button>
  );

  if (isHost && status === 'pending') {
    return (
      <>
        {showDetails && (
          <BookingDetailsModal
            bookingId={bookingId}
            onClose={() => setShowDetails(false)}
            onAccept={accept}
            onDecline={decline}
            canAct
            acting={acting}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={accept}
            disabled={acting !== null}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
              background: acting === 'accept' ? '#15803d99' : '#16a34a',
              color: '#fff', fontWeight: 700, fontSize: 14, cursor: acting ? 'wait' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {acting === 'accept' ? '⏳ Accepting…' : '✅ Accept'}
          </button>
          <button
            onClick={decline}
            disabled={acting !== null}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid #ef4444',
              background: '#fff', color: '#ef4444', fontWeight: 700, fontSize: 14,
              cursor: acting ? 'wait' : 'pointer', transition: 'background 0.15s',
            }}
          >
            {acting === 'decline' ? '⏳ Declining…' : '✕ Decline'}
          </button>
        </div>
        {viewDetailsBtn}
      </>
    );
  }

  if (isHost && status === 'confirmed') {
    return (
      <>
        {showDetails && (
          <BookingDetailsModal
            bookingId={bookingId}
            onClose={() => setShowDetails(false)}
            canAct={false}
            acting={null}
          />
        )}
        <div style={{ marginTop: 8, fontSize: 13, color: '#d97706', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
          ⏳ Waiting for renter payment
        </div>
        {viewDetailsBtn}
      </>
    );
  }

  if (isHost && (status === 'paid' || status === 'completed')) {
    return (
      <>
        {showDetails && (
          <BookingDetailsModal
            bookingId={bookingId}
            onClose={() => setShowDetails(false)}
            canAct={false}
            acting={null}
          />
        )}
        <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
          ✅ Paid
        </div>
        {viewDetailsBtn}
      </>
    );
  }

  if (isHost && status === 'rejected') {
    return (
      <>
        {showDetails && (
          <BookingDetailsModal
            bookingId={bookingId}
            onClose={() => setShowDetails(false)}
            canAct={false}
            acting={null}
          />
        )}
        <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '6px 0' }}>
          Booking declined
        </div>
        {viewDetailsBtn}
      </>
    );
  }

  if (isRenter && status === 'pending') {
    return (
      <div style={{ marginTop: 8, fontSize: 13, color: '#d97706', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
        ⏳ Waiting for host approval
      </div>
    );
  }

  if (isRenter && status === 'confirmed') {
    const publicTotal = Number(booking.totalPrice);
    const commissionRate = Number(booking.snapshotCommissionRate ?? 0.10);
    const platformMargin = +(publicTotal * commissionRate).toFixed(2);
    const walletDiscount = +(platformMargin * 0.5).toFixed(2);
    const walletTotal = +(publicTotal - walletDiscount).toFixed(2);
    return (
      <RenterPayActions
        bookingId={bookingId}
        publicTotal={publicTotal}
        walletTotal={walletTotal}
        walletDiscount={walletDiscount}
      />
    );
  }

  if (isRenter && (status === 'paid' || status === 'completed')) {
    return (
      <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
        ✅ Payment completed
      </div>
    );
  }

  if (isRenter && status === 'rejected') {
    return (
      <div style={{ marginTop: 8, fontSize: 13, color: '#ef4444', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
        ❌ Booking declined by host
      </div>
    );
  }

  return null;
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

  // Each conversation maps to exactly one booking (unique renter+host+booking).
  // Older BOOKING_CARD messages were persisted before the card JSON carried a
  // bookingId, so fall back to the conversation's bookingId for accept/reject.
  const conversationsQuery = useConversations();
  const conversationBookingId =
    conversationsQuery.data?.find((c) => c.id === conversationId)?.bookingId ?? null;

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
    connected,
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
            style={{ color: '#64748b', textDecoration: 'none', fontSize: 20, padding: '4px 8px', borderRadius: 8 }}
          >
            ←
          </Link>

          {/* Avatar initial */}
          {(() => {
            const other = messages.find(m => m.senderId !== myId)?.sender;
            const name = other?.name ?? 'Chat';
            const initial = name[0]?.toUpperCase() ?? '?';
            return (
              <>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 15,
                }}>
                  {initial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: 15, lineHeight: 1.2 }}>
                    {name}
                  </p>
                  {/* Connection status */}
                  <span style={{
                    fontSize: 11, fontWeight: 500,
                    color: connected ? '#22c55e' : '#f59e0b',
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 1,
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: connected ? '#22c55e' : '#f59e0b',
                      boxShadow: connected ? '0 0 4px #22c55e' : 'none',
                    }} />
                    {connected ? 'Live' : 'Reconnecting…'}
                  </span>
                </div>
              </>
            );
          })()}
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

                // ── Detect booking card ───────────────────────────────
                let card: null | {
                  type: string; listingId: string; listingTitle: string;
                  listingImage: string | null; categoryName: string | null;
                  bookingId: string; dateLabel: string; nightsLabel: string | null;
                  totalPrice: number; currency: string;
                } = null;
                if (msg.content?.startsWith('{"type":"BOOKING_CARD"')) {
                  try { card = JSON.parse(msg.content); } catch { /* ignore */ }
                }

                return (
                  <div key={msg.id} style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 8,
                  }}>
                    <div style={{ maxWidth: card ? '85%' : '70%', width: card ? '320px' : undefined }}>

                      {/* ── Rich booking card ── */}
                      {card ? (
                        <div>
                        <Link href={`/listings/${card.listingId}`} style={{ textDecoration: 'none' }}>
                          <div style={{
                            borderRadius: 16, overflow: 'hidden',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                            background: '#fff', cursor: 'pointer',
                            transition: 'box-shadow 0.15s',
                          }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.14)')}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
                          >
                            {/* Image */}
                            <div style={{ width: '100%', height: 160, background: '#f1f5f9', position: 'relative', overflow: 'hidden' }}>
                              <BookingCardImage
                                listingId={card.listingId}
                                storedImage={card.listingImage}
                                title={card.listingTitle}
                              />
                              {/* Booking request badge */}
                              <div style={{
                                position: 'absolute', top: 10, left: 10,
                                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                                borderRadius: 20, padding: '4px 10px',
                                fontSize: 11, fontWeight: 600, color: '#fff',
                                display: 'flex', alignItems: 'center', gap: 5,
                              }}>
                                📋 Booking request
                              </div>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '12px 14px 14px' }}>
                              {/* Category pill */}
                              {card.categoryName && (
                                <span style={{
                                  display: 'inline-block', fontSize: 11, fontWeight: 600,
                                  color: '#3b82f6', background: '#eff6ff',
                                  borderRadius: 20, padding: '2px 8px', marginBottom: 6,
                                }}>
                                  {card.categoryName}
                                </span>
                              )}

                              {/* Title */}
                              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 15, color: '#0f172a', lineHeight: 1.3 }}>
                                {card.listingTitle}
                              </p>

                              {/* Dates */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 13 }}>📅</span>
                                <span style={{ fontSize: 13, color: '#475569' }}>{card.dateLabel}</span>
                                {card.nightsLabel && (
                                  <span style={{
                                    fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0',
                                    borderRadius: 10, padding: '1px 7px', color: '#64748b', fontWeight: 600,
                                  }}>{card.nightsLabel}</span>
                                )}
                              </div>

                              {/* Price */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>Total</span>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                  {card.currency} {card.totalPrice.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                        <BookingCardActions bookingId={card.bookingId ?? conversationBookingId ?? ''} myId={myId} />
                        </div>
                      ) : (
                        /* ── Plain text bubble ── */
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          background: isMe ? '#3b82f6' : '#fff',
                          color: isMe ? '#fff' : '#0f172a',
                          border: isMe ? 'none' : '1px solid #e2e8f0',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          fontSize: 14, lineHeight: '1.5', wordBreak: 'break-word',
                        }}>
                          {msg.content}
                        </div>
                      )}

                      {/* Timestamp */}
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
          {detectContact(input).detected ? (
            <div
              style={{
                maxWidth: 800,
                margin: '0 auto 8px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                borderRadius: 12,
                padding: '8px 12px',
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              <strong>Heads up:</strong> we hide phone numbers, emails, and
              social handles in messages. Bookings paid outside the platform
              aren't protected — pay through RentEverything to be covered.
            </div>
          ) : null}
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
