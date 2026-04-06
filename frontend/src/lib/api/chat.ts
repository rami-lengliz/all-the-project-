/**
 * chat.ts — thin REST wrappers for the chat API.
 *
 * Axios baseURL is already `${API_URL}/api` (set in http.ts).
 * So paths here start with `/chat/...` → resolves to `/api/chat/...`.
 * JWT is injected automatically by the request interceptor in http.ts.
 */

import { api } from './http';

const BASE = '/chat';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ConversationUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ConversationBooking {
  id: string;
  status: string;
  listing?: { id: string; title: string } | null;
}

/** A chat thread between a renter and a host, optionally linked to a booking. */
export interface Conversation {
  id: string;
  renterId: string;
  hostId: string;
  bookingId?: string | null;
  listingId?: string | null;
  lastMessageAt?: string | null;
  updatedAt: string;
  unreadCount?: number;            // populated by backend if returned
  renter?: ConversationUser;
  host?: ConversationUser;
  /** Convenience field — the other participant (relative to the current user). */
  otherUser?: ConversationUser;
  booking?: ConversationBooking | null;
  listing?: { id: string; title: string } | null;
  messages?: Message[];            // last N messages (preview)
}

/** A single chat message. */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt?: string | null;
  sender?: ConversationUser;
}

export interface MessagesPage {
  messages: Message[];
  total: number;
  hasMore: boolean;
}

// ─────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────

/** GET /api/chat/conversations — returns all conversations for the current user, sorted by lastMessageAt desc. */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await api.get<any>(`${BASE}/conversations`);
  const raw = res.data?.data ?? res.data;
  return Array.isArray(raw) ? raw : [];
}

/** GET /api/chat/conversations/:id/messages — paginated, oldest-first. */
export async function fetchMessages(
  conversationId: string,
  page?: number,
): Promise<MessagesPage> {
  const res = await api.get<any>(
    `${BASE}/conversations/${conversationId}/messages`,
    { params: page !== undefined ? { page } : undefined },
  );
  const data = res.data?.data ?? res.data;
  return {
    messages: data?.messages ?? (Array.isArray(data) ? data : []),
    total:    data?.total    ?? 0,
    hasMore:  data?.hasMore  ?? false,
  };
}

/** POST /api/chat/conversations — create or retrieve an existing conversation. */
export async function createConversation(
  otherUserId: string,
  bookingId?: string,
  listingId?: string,
): Promise<Conversation> {
  const res = await api.post<any>(`${BASE}/conversations`, {
    otherUserId,
    bookingId,
    listingId,
  });
  return res.data?.data ?? res.data;
}

/** PATCH /api/chat/messages/read — mark a list of message IDs as read. */
export async function markRead(messageIds: string[]): Promise<void> {
  await api.patch(`${BASE}/messages/read`, { messageIds });
}

/** GET /api/chat/unread-count — total unread messages across all conversations. */
export async function fetchUnreadCount(): Promise<number> {
  const res = await api.get<any>(`${BASE}/unread-count`);
  const data = res.data?.data ?? res.data;
  return Number(data?.count ?? 0);
}

// ─────────────────────────────────────────────
// Example usage
// ─────────────────────────────────────────────
/*
import {
  fetchConversations,
  fetchMessages,
  createConversation,
  markRead,
  fetchUnreadCount,
} from '@/lib/api/chat';

// List all conversations (sorted by most recent message)
const conversations = await fetchConversations();

// Load messages for a specific thread (first page)
const { messages, hasMore } = await fetchMessages('conv-uuid-here', 1);

// Open (or create) a thread tied to a booking
const conv = await createConversation(
  'host-user-uuid',
  'booking-uuid',   // optional
  'listing-uuid',   // optional
);

// Mark messages as read after the user views the thread
await markRead(messages.map((m) => m.id));

// Get the badge count for the header icon
const count = await fetchUnreadCount(); // e.g. 3
*/
