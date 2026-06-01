import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HostLayout } from '@/components/host/HostLayout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useListing } from '@/lib/api/hooks/useListing';
import {
  useListingAvailability,
  useCreateAvailabilityBlock,
  useDeleteAvailabilityBlock,
  useSetDatePrices,
  useClearDatePrices,
  useSetMinNights,
  useImportIcal,
  useRemoveIcal,
} from '@/lib/api/hooks/useListingAvailability';
import { eachDayExclusive, priceMap, icalExportUrl } from '@/lib/api/availability';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';

// ── calendar helpers ──────────────────────────────────────────────────────────
function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
}
function addDaysYMD(s: string, n: number) {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(a: string, b: string) {
  return Math.max(
    0,
    Math.round(
      (new Date(`${b}T00:00:00Z`).getTime() -
        new Date(`${a}T00:00:00Z`).getTime()) /
        86400000,
    ),
  );
}
function prettyDate(s: string) {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function HostListingCalendarPage() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const { user } = useAuth();

  const listingQuery = useListing(id);
  const listing = listingQuery.data as any;
  const availabilityQuery = useListingAvailability(id);

  const createBlock = useCreateAvailabilityBlock(id ?? '');
  const deleteBlock = useDeleteAvailabilityBlock(id ?? '');
  const setPrices = useSetDatePrices(id ?? '');
  const clearPrices = useClearDatePrices(id ?? '');
  const saveMinNights = useSetMinNights(id ?? '');
  const importFeed = useImportIcal(id ?? '');
  const removeFeed = useRemoveIcal(id ?? '');

  const [calDate, setCalDate] = useState(() => new Date());
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const today = toYMD(new Date());

  const [selStart, setSelStart] = useState('');
  const [selEnd, setSelEnd] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [minNightsInput, setMinNightsInput] = useState('');
  const [icalUrlInput, setIcalUrlInput] = useState('');

  const av = availabilityQuery.data;
  const basePrice = av?.pricePerDay ?? Number(listing?.pricePerDay ?? 0);
  const prices = useMemo(
    () => (av ? priceMap(av) : new Map<string, number>()),
    [av],
  );

  const { bookedDays, blockedDayToId, blocks } = useMemo(() => {
    const bked = new Set<string>();
    const bmap = new Map<string, string>();
    if (av) {
      for (const r of av.booked)
        for (const d of eachDayExclusive(r.startDate, r.endDate)) bked.add(d);
      for (const b of av.blocked)
        for (const d of eachDayExclusive(b.startDate, b.endDate))
          bmap.set(d, b.id);
    }
    return { bookedDays: bked, blockedDayToId: bmap, blocks: av?.blocked ?? [] };
  }, [av]);

  const monthStats = useMemo(() => {
    const total = daysInMonth(calYear, calMonth);
    let booked = 0;
    let blocked = 0;
    for (let d = 1; d <= total; d++) {
      const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (bookedDays.has(ds)) booked++;
      else if (blockedDayToId.has(ds)) blocked++;
    }
    return { total, booked, blocked, open: total - booked - blocked };
  }, [calYear, calMonth, bookedDays, blockedDayToId]);

  const isSlot = listing?.bookingType === 'SLOT';
  const isOwner =
    !!user && (listing?.hostId === user.id || listing?.host?.id === user.id);

  function isUnavailable(day: string) {
    return bookedDays.has(day) || blockedDayToId.has(day);
  }
  function effPrice(day: string) {
    return prices.get(day) ?? basePrice;
  }

  function rangeCollides(lo: string, hi: string) {
    let cur = lo;
    while (cur <= hi) {
      if (isUnavailable(cur)) return true;
      cur = addDaysYMD(cur, 1);
    }
    return false;
  }

  async function handleRemove(blockId: string) {
    try {
      await deleteBlock.mutateAsync(blockId);
      toast({
        title: 'Block removed',
        message: 'Those dates are open for booking again.',
        variant: 'info',
      });
    } catch (e: any) {
      toast({
        title: 'Could not remove block',
        message: e?.response?.data?.message ?? e?.message ?? 'Try again.',
        variant: 'error',
      });
    }
  }

  function handleDayClick(day: string) {
    if (isSlot || day < today) return;
    const blockId = blockedDayToId.get(day);
    if (blockId) {
      void handleRemove(blockId);
      return;
    }
    if (bookedDays.has(day)) return;

    if (!selStart || (selStart && selEnd)) {
      setSelStart(day);
      setSelEnd('');
      return;
    }
    const lo = day < selStart ? day : selStart;
    const hi = day < selStart ? selStart : day;
    if (rangeCollides(lo, hi)) {
      setSelStart(day);
      setSelEnd('');
      return;
    }
    setSelStart(lo);
    setSelEnd(hi);
  }

  function clearSelection() {
    setSelStart('');
    setSelEnd('');
    setNoteInput('');
    setPriceInput('');
  }

  async function handleBlock() {
    if (!selStart || !id) return;
    const endInclusive = selEnd || selStart;
    try {
      await createBlock.mutateAsync({
        startDate: selStart,
        endDate: addDaysYMD(endInclusive, 1),
        note: noteInput.trim() || undefined,
      });
      toast({
        title: 'Dates blocked',
        message: 'These dates are now unavailable to renters.',
        variant: 'success',
      });
      clearSelection();
    } catch (e: any) {
      toast({
        title: 'Could not block dates',
        message: e?.response?.data?.message ?? e?.message ?? 'Try again.',
        variant: 'error',
      });
    }
  }

  async function handleSetPrice() {
    if (!selStart || !id) return;
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      toast({
        title: 'Enter a price',
        message: 'Type a nightly price greater than 0.',
        variant: 'error',
      });
      return;
    }
    const endInclusive = selEnd || selStart;
    try {
      const res = await setPrices.mutateAsync({
        startDate: selStart,
        endDate: addDaysYMD(endInclusive, 1),
        price,
      });
      toast({
        title: 'Price updated',
        message: `Custom price set for ${res.updated} night${res.updated !== 1 ? 's' : ''}.`,
        variant: 'success',
      });
      clearSelection();
    } catch (e: any) {
      toast({
        title: 'Could not set price',
        message: e?.response?.data?.message ?? e?.message ?? 'Try again.',
        variant: 'error',
      });
    }
  }

  async function handleClearPrice() {
    if (!selStart || !id) return;
    const endInclusive = selEnd || selStart;
    try {
      await clearPrices.mutateAsync({
        from: selStart,
        to: addDaysYMD(endInclusive, 1),
      });
      toast({
        title: 'Custom pricing cleared',
        message: 'Those nights are back to your base price.',
        variant: 'info',
      });
      clearSelection();
    } catch (e: any) {
      toast({
        title: 'Could not clear pricing',
        message: e?.response?.data?.message ?? e?.message ?? 'Try again.',
        variant: 'error',
      });
    }
  }

  async function handleSaveMinNights() {
    const n = parseInt(minNightsInput, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast({ title: 'Invalid value', message: 'Minimum 1 night.', variant: 'error' });
      return;
    }
    try {
      await saveMinNights.mutateAsync(n);
      toast({
        title: 'Minimum stay updated',
        message: `Bookings now need at least ${n} night${n !== 1 ? 's' : ''}.`,
        variant: 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Could not update',
        message: e?.response?.data?.message ?? e?.message ?? 'Try again.',
        variant: 'error',
      });
    }
  }

  async function handleImport() {
    try {
      const res = await importFeed.mutateAsync(icalUrlInput.trim() || undefined);
      toast({
        title: 'Calendar synced',
        message: `Imported ${res.imported} blocked period${res.imported !== 1 ? 's' : ''}.`,
        variant: 'success',
      });
      setIcalUrlInput('');
    } catch (e: any) {
      toast({
        title: 'Sync failed',
        message: e?.response?.data?.message ?? e?.message ?? 'Check the URL and try again.',
        variant: 'error',
      });
    }
  }

  async function handleRemoveFeed() {
    try {
      await removeFeed.mutateAsync();
      toast({
        title: 'Sync disconnected',
        message: 'Imported dates were removed; your manual blocks are untouched.',
        variant: 'info',
      });
    } catch (e: any) {
      toast({
        title: 'Could not disconnect',
        message: e?.response?.data?.message ?? e?.message ?? 'Try again.',
        variant: 'error',
      });
    }
  }

  function copyExportUrl() {
    if (!id) return;
    const url = icalExportUrl(id);
    void navigator.clipboard?.writeText(url).then(
      () =>
        toast({
          title: 'Link copied',
          message: 'Paste it into Airbnb/Booking.com to import your calendar.',
          variant: 'success',
        }),
      () => {
        /* clipboard blocked — no-op */
      },
    );
  }

  function dayClass(day: string) {
    if (day < today) return 'bg-gray-50 text-gray-300 cursor-not-allowed';
    if (bookedDays.has(day))
      return 'bg-rose-100 text-rose-700 cursor-not-allowed';
    if (blockedDayToId.has(day))
      return 'bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer';
    const inSel =
      selStart &&
      ((selEnd && day >= selStart && day <= selEnd) ||
        (!selEnd && day === selStart));
    if (inSel) return 'bg-blue-500 text-white cursor-pointer';
    return 'bg-white hover:bg-gray-100 cursor-pointer text-gray-900';
  }

  const importedCount = blocks.filter((b) => b.source === 'ical').length;
  const hasFeed = Boolean(listing?.icalImportUrl);

  // ── render states ──────────────────────────────────────────────────────────
  if (listingQuery.isLoading) {
    return (
      <HostLayout activeTab="listings" title="Availability">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <LoadingCard />
        </div>
      </HostLayout>
    );
  }
  if (listingQuery.isError || !listing) {
    return (
      <HostLayout activeTab="listings" title="Availability">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <InlineError
            message="Failed to load this listing."
            onRetry={() => void listingQuery.refetch()}
          />
        </div>
      </HostLayout>
    );
  }
  if (!isOwner) {
    return (
      <HostLayout activeTab="listings" title="Availability">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <EmptyState
            icon="fa-solid fa-lock"
            title="Not your listing"
            message="You can only manage the calendar of listings you host."
          />
        </div>
      </HostLayout>
    );
  }

  return (
    <HostLayout activeTab="listings" title="Availability" subtitle={listing.title}>
      <section className="py-6">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Calendar &amp; pricing</h2>
            <Link
              href="/host/listings"
              className="text-sm font-medium text-blue-500 hover:text-blue-600"
            >
              ← Back to listings
            </Link>
          </div>

          {isSlot ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="font-semibold text-amber-900">
                This is a slot-based listing
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                Date blocking and per-night pricing are for daily listings. Your
                availability is governed by operating hours — edit them in the{' '}
                <Link
                  href={`/host/listings/${id}/edit`}
                  className="font-medium underline"
                >
                  listing editor
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              {/* Calendar */}
              <div className="lg:col-span-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))}
                      className="rounded-lg p-2 transition hover:bg-gray-100"
                      aria-label="Previous month"
                    >
                      <i className="fa-solid fa-chevron-left text-gray-600" />
                    </button>
                    <h3 className="font-semibold text-gray-900">
                      {MONTH_NAMES[calMonth]} {calYear}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))}
                      className="rounded-lg p-2 transition hover:bg-gray-100"
                      aria-label="Next month"
                    >
                      <i className="fa-solid fa-chevron-right text-gray-600" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                      <div key={d} className="py-2 text-xs font-medium text-gray-500">
                        {d}
                      </div>
                    ))}

                    {Array.from({ length: firstDayOfMonth(calYear, calMonth) }).map(
                      (_, i) => (
                        <div key={`e${i}`} />
                      ),
                    )}

                    {Array.from({ length: daysInMonth(calYear, calMonth) }, (_, i) => {
                      const dayNum = i + 1;
                      const dayStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const past = dayStr < today;
                      const booked = bookedDays.has(dayStr);
                      const custom = prices.has(dayStr);
                      return (
                        <button
                          type="button"
                          key={dayNum}
                          onClick={() => handleDayClick(dayStr)}
                          disabled={past || booked}
                          className={`flex h-14 flex-col items-center justify-center rounded-lg border border-transparent text-sm transition ${dayClass(dayStr)}`}
                        >
                          <span className="font-medium leading-none">{dayNum}</span>
                          {!past && !booked && (
                            <span
                              className={`mt-1 text-[10px] leading-none ${custom ? 'font-semibold text-emerald-600' : 'text-gray-400'}`}
                            >
                              {Math.round(effPrice(dayStr))}
                            </span>
                          )}
                          {booked && (
                            <span className="mt-1 text-[10px] leading-none text-rose-500">
                              booked
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend + month stats */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-200 pt-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded bg-blue-500" /> Selected
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded border border-amber-300 bg-amber-100" />{' '}
                      Blocked
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded border border-rose-300 bg-rose-100" />{' '}
                      Booked
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold text-emerald-600">00</span>{' '}
                      Custom price
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    This month: <strong className="text-gray-700">{monthStats.open}</strong> open ·{' '}
                    <strong className="text-amber-700">{monthStats.blocked}</strong> blocked ·{' '}
                    <strong className="text-rose-700">{monthStats.booked}</strong> booked
                  </p>
                </div>
              </div>

              {/* Side panel */}
              <div className="space-y-6 lg:col-span-2">
                {/* Selection actions */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="font-semibold text-gray-900">Selected dates</h3>
                  {selStart ? (
                    <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm">
                      <p className="font-medium text-blue-900">
                        {prettyDate(selStart)}
                        {selEnd && selEnd !== selStart ? ` → ${prettyDate(selEnd)}` : ''}
                      </p>
                      <p className="text-blue-700">
                        {nightsBetween(selStart, addDaysYMD(selEnd || selStart, 1))}{' '}
                        night
                        {nightsBetween(selStart, addDaysYMD(selEnd || selStart, 1)) !== 1
                          ? 's'
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-400">
                      Tap a start and end date on the calendar.
                    </p>
                  )}

                  {selStart && (
                    <div className="mt-4 space-y-4">
                      {/* Block */}
                      <div>
                        <input
                          type="text"
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder="Optional note (e.g. Owner staying)"
                          maxLength={255}
                          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleBlock()}
                          disabled={createBlock.isPending}
                          className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
                        >
                          {createBlock.isPending ? 'Blocking…' : 'Block these dates'}
                        </button>
                      </div>

                      {/* Custom price */}
                      <div className="border-t border-gray-100 pt-4">
                        <label className="mb-1 block text-xs font-semibold text-gray-600">
                          Custom price / night (TND)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="1"
                            step="0.5"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            placeholder={String(Math.round(basePrice))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSetPrice()}
                            disabled={setPrices.isPending}
                            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {setPrices.isPending ? '…' : 'Apply'}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleClearPrice()}
                          disabled={clearPrices.isPending}
                          className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                        >
                          Reset to base price ({Math.round(basePrice)} TND)
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={clearSelection}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>

                {/* Minimum nights */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="font-semibold text-gray-900">Minimum stay</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Currently {av?.minNights ?? 1} night
                    {(av?.minNights ?? 1) !== 1 ? 's' : ''} minimum.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={minNightsInput}
                      onChange={(e) => setMinNightsInput(e.target.value)}
                      placeholder={String(av?.minNights ?? 1)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveMinNights()}
                      disabled={saveMinNights.isPending || !minNightsInput}
                      className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* iCal sync */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="font-semibold text-gray-900">Calendar sync (iCal)</h3>

                  <p className="mt-3 text-xs font-semibold text-gray-600">
                    Export this calendar
                  </p>
                  <p className="text-xs text-gray-500">
                    Paste into Airbnb/Booking.com so they block your booked dates.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      readOnly
                      value={id ? icalExportUrl(id) : ''}
                      className="w-full truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
                    />
                    <button
                      type="button"
                      onClick={copyExportUrl}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  </div>

                  <p className="mt-4 text-xs font-semibold text-gray-600">
                    Import another calendar
                  </p>
                  <p className="text-xs text-gray-500">
                    Auto-block dates booked elsewhere. {hasFeed && `${importedCount} imported.`}
                  </p>
                  <input
                    type="url"
                    value={icalUrlInput}
                    onChange={(e) => setIcalUrlInput(e.target.value)}
                    placeholder={listing?.icalImportUrl ?? 'https://…/calendar.ics'}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleImport()}
                      disabled={importFeed.isPending}
                      className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
                    >
                      {importFeed.isPending
                        ? 'Syncing…'
                        : hasFeed
                          ? 'Re-sync'
                          : 'Import & sync'}
                    </button>
                    {hasFeed && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveFeed()}
                        disabled={removeFeed.isPending}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {/* Blocked periods list */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="font-semibold text-gray-900">Blocked periods</h3>
                  {availabilityQuery.isLoading ? (
                    <p className="mt-3 text-sm text-gray-400">Loading…</p>
                  ) : blocks.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-400">
                      No blocked dates — your calendar is fully open.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {blocks.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-800">
                              {prettyDate(b.startDate)} →{' '}
                              {prettyDate(addDaysYMD(b.endDate, -1))}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {b.source === 'ical' ? (
                                <span className="text-blue-600">synced</span>
                              ) : (
                                b.note || 'manual'
                              )}
                            </p>
                          </div>
                          {b.source !== 'ical' && (
                            <button
                              type="button"
                              onClick={() => void handleRemove(b.id)}
                              disabled={deleteBlock.isPending}
                              className="ml-2 shrink-0 rounded-md p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label="Remove block"
                              title="Remove block"
                            >
                              <i className="fa-solid fa-trash-can" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </HostLayout>
  );
}
