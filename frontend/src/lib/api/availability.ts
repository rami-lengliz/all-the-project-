/**
 * availability.ts — REST wrappers for the listing availability calendar.
 *
 * Axios baseURL is already `${API_URL}/api` (set in http.ts), so paths here
 * start with `/listings/...`. JWT is injected automatically for the host-only
 * mutation endpoints.
 *
 * Date convention (matches the backend + bookings): `endDate` is EXCLUSIVE —
 * a range 2026-07-01 → 2026-07-08 covers the nights of Jul 1–7.
 */
import { api } from './http';
import { API_URL } from './env';

export interface DateRange {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD exclusive
}

export interface AvailabilityBlock extends DateRange {
  id: string;
  note: string | null;
  source: string; // "manual" | "ical"
}

export interface DatePrice {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface ListingAvailability {
  pricePerDay: number;
  minNights: number;
  /** Real bookings — always unavailable, not removable by the host. */
  booked: DateRange[];
  /** Host-created or imported blocks. */
  blocked: AvailabilityBlock[];
  /** Per-date custom nightly prices (override the base pricePerDay). */
  prices: DatePrice[];
}

/** GET /api/listings/:id/availability — booked + blocked + per-date prices. Public. */
export async function fetchListingAvailability(
  listingId: string,
): Promise<ListingAvailability> {
  const res = await api.get<any>(`/listings/${listingId}/availability`);
  const data = res.data?.data ?? res.data;
  return {
    pricePerDay: Number(data?.pricePerDay ?? 0),
    minNights: Number(data?.minNights ?? 1),
    booked: data?.booked ?? [],
    blocked: data?.blocked ?? [],
    prices: data?.prices ?? [],
  };
}

/** Map of YYYY-MM-DD → custom price for fast per-day lookups. */
export function priceMap(av: ListingAvailability): Map<string, number> {
  return new Map(av.prices.map((p) => [p.date, p.price]));
}

/** Public URL hosts paste into Airbnb/Booking.com to import this calendar. */
export function icalExportUrl(listingId: string): string {
  return `${API_URL}/api/listings/${listingId}/calendar.ics`;
}

/** POST /api/listings/:id/prices — custom nightly price for [startDate, endDate). */
export async function setDatePrices(
  listingId: string,
  body: { startDate: string; endDate: string; price: number },
): Promise<{ updated: number }> {
  const res = await api.post<any>(`/listings/${listingId}/prices`, body);
  return res.data?.data ?? res.data;
}

/** DELETE /api/listings/:id/prices?from=&to= — clear custom prices in a range. */
export async function clearDatePrices(
  listingId: string,
  from: string,
  to: string,
): Promise<{ cleared: number }> {
  const res = await api.delete<any>(`/listings/${listingId}/prices`, {
    params: { from, to },
  });
  return res.data?.data ?? res.data;
}

/** PATCH /api/listings/:id/min-nights */
export async function setMinNights(
  listingId: string,
  minNights: number,
): Promise<{ minNights: number }> {
  const res = await api.patch<any>(`/listings/${listingId}/min-nights`, {
    minNights,
  });
  return res.data?.data ?? res.data;
}

/** POST /api/listings/:id/ical/import — import/sync an external feed. */
export async function importIcal(
  listingId: string,
  url?: string,
): Promise<{ imported: number; url: string }> {
  const res = await api.post<any>(`/listings/${listingId}/ical/import`, { url });
  return res.data?.data ?? res.data;
}

/** DELETE /api/listings/:id/ical/import — stop syncing + drop imported blocks. */
export async function removeIcal(listingId: string): Promise<void> {
  await api.delete(`/listings/${listingId}/ical/import`);
}

/** POST /api/listings/:id/blocks — block a date range (host only). */
export async function createAvailabilityBlock(
  listingId: string,
  body: { startDate: string; endDate: string; note?: string },
): Promise<AvailabilityBlock> {
  const res = await api.post<any>(`/listings/${listingId}/blocks`, body);
  return res.data?.data ?? res.data;
}

/** DELETE /api/listings/:id/blocks/:blockId — remove a block (host only). */
export async function deleteAvailabilityBlock(
  listingId: string,
  blockId: string,
): Promise<void> {
  await api.delete(`/listings/${listingId}/blocks/${blockId}`);
}

/** Expand a [startDate, endDate) range into its individual YYYY-MM-DD days. */
export function eachDayExclusive(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cur < end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Flatten booked + blocked ranges into a Set of unavailable YYYY-MM-DD days. */
export function expandUnavailableDays(av: ListingAvailability): Set<string> {
  const set = new Set<string>();
  for (const r of av.booked)
    for (const d of eachDayExclusive(r.startDate, r.endDate)) set.add(d);
  for (const b of av.blocked)
    for (const d of eachDayExclusive(b.startDate, b.endDate)) set.add(d);
  return set;
}
