import { useEffect, useRef } from 'react';
import { api } from '@/lib/api/http';
import { readAuth } from '@/lib/auth/storage';

/**
 * Records a "view" interaction when the attached element has been visible
 * for at least DWELL_MS without the user scrolling past. Used by ListingCard
 * to feed the personalization engine.
 *
 * - Anonymous users are skipped (no JWT, no user to attribute the view to).
 * - Dedupe per page-load via a module-level Set so revisiting the same card
 *   while scrolling doesn't generate dozens of events.
 * - Fire-and-forget: never blocks render, swallows network errors.
 */

const DWELL_MS = 1_000;
const seenThisSession = new Set<string>();

export function useViewTracker(listingId: string | undefined) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listingId) return;
    if (seenThisSession.has(listingId)) return;
    const { accessToken } = readAuth();
    if (!accessToken) return;
    const node = elementRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (dwellTimer) continue;
            dwellTimer = setTimeout(() => {
              if (seenThisSession.has(listingId)) return;
              seenThisSession.add(listingId);
              api.post(`/listings/${listingId}/view`).catch(() => {
                // Soft-fail: if the request errors we just drop the view event.
                seenThisSession.delete(listingId);
              });
              observer.disconnect();
            }, DWELL_MS);
          } else if (dwellTimer) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(node);
    return () => {
      if (dwellTimer) clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [listingId]);

  return elementRef;
}
