import Link from 'next/link';
import type { Listing } from '@/lib/api/types';
import { formatTnd } from '@/lib/utils/format';
import { useCompare } from '@/lib/context/CompareContext';
import { WishlistButton } from '@/components/shared/WishlistButton';

interface MatchFilters {
  nearSea?: boolean;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  availableFrom?: string;
  availableTo?: string;
  categorySlug?: string;
}

function buildMatchBadges(listing: Listing, filters: MatchFilters) {
  const badges: { icon: string; label: string; color: string }[] = [];
  const price = Number(listing.pricePerDay);

  if (filters.nearSea) {
    badges.push({ icon: 'fa-water', label: 'Bord de mer', color: 'text-blue-600 bg-blue-50 border-blue-200' });
  }
  if (filters.city) {
    badges.push({ icon: 'fa-location-dot', label: filters.city.charAt(0).toUpperCase() + filters.city.slice(1), color: 'text-emerald-700 bg-emerald-50 border-emerald-200' });
  }
  if (filters.maxPrice != null && price > 0 && price <= filters.maxPrice) {
    badges.push({ icon: 'fa-tag', label: `Sous ${filters.maxPrice} TND`, color: 'text-violet-700 bg-violet-50 border-violet-200' });
  }
  if (filters.availableFrom) {
    const from = new Date(filters.availableFrom + 'T00:00:00');
    const label = from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    badges.push({ icon: 'fa-calendar-check', label: `Dès ${label}`, color: 'text-amber-700 bg-amber-50 border-amber-200' });
  }
  return badges;
}

// Map a server-side match string to an icon + color (keyword heuristics).
function iconForMatch(label: string): { icon: string; color: string } {
  const l = label.toLowerCase();
  if (/bord|mer|plage|beach/.test(l))       return { icon: 'fa-water',          color: 'text-blue-600 bg-blue-50 border-blue-200' };
  if (/^à |\bville\b|location/.test(l))     return { icon: 'fa-location-dot',   color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (/tnd|prix|sous|dès/.test(l))          return { icon: 'fa-tag',            color: 'text-violet-700 bg-violet-50 border-violet-200' };
  if (/dispo|date/.test(l))                 return { icon: 'fa-calendar-check', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (/correspond|match/.test(l))           return { icon: 'fa-check',          color: 'text-slate-700 bg-slate-50 border-slate-200' };
  if (/créneau|slot/.test(l))               return { icon: 'fa-clock',          color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
  return { icon: 'fa-check', color: 'text-slate-700 bg-slate-50 border-slate-200' };
}

export function ListingCard({ listing, matchFilters }: { listing: Listing & { matches?: string[] }; matchFilters?: MatchFilters }) {
  const { selectedIds, toggleListing, isMaxSelected } = useCompare();
  const isSelected = selectedIds.includes(listing.id);
  // Prefer the server's match list (it's computed against synonyms + actual SQL match).
  // Fall back to client-side reconstruction for non-AI listings.
  const matchBadges = (listing.matches && listing.matches.length)
    ? listing.matches.map(label => ({ label, ...iconForMatch(label) }))
    : (matchFilters ? buildMatchBadges(listing, matchFilters) : []);

  const city =
    listing.address?.split(',').slice(-2).join(',').trim() ||
    listing.address ||
    'Kelibia';

  const distanceLabel = listing.distance != null
    ? listing.distance < 1000
      ? `${Math.round(listing.distance)} m away`
      : `${(listing.distance / 1000).toFixed(1)} km away`
    : null;

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:shadow-md">
      {/* Wishlist heart — top-left so it doesn't fight the Compare checkbox */}
      <WishlistButton
        listingId={listing.id}
        className="absolute top-3 left-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md hover:scale-105 transition disabled:opacity-60"
      />
      <div className="absolute top-3 right-3 z-20">
        <label className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-200 cursor-pointer hover:bg-white transition shadow-sm">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
            checked={isSelected}
            onChange={(e) => {
              e.preventDefault();
              toggleListing(listing.id);
            }}
            disabled={!isSelected && isMaxSelected}
          />
          <span className="text-[10px] font-bold text-slate-700 uppercase">Compare</span>
        </label>
      </div>

      <Link
        href={`/listings/${listing.id}`}
        className="block"
      >
      <div className="aspect-[16/10] bg-slate-100 overflow-hidden">
        {listing.images && listing.images.length > 0 ? (
          <img
            src={
              listing.images[0].startsWith('http') ||
              listing.images[0].startsWith('/')
                ? listing.images[0]
                : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${listing.images[0]}`
            }
            alt={listing.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.png';
              e.currentTarget.onerror = null;
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <i className="fa-solid fa-image text-4xl"></i>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 group-hover:text-primary">
              {listing.title}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <span>{city}</span>
              {distanceLabel && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1 text-blue-500 font-medium">
                    <i className="fa-solid fa-location-dot text-[9px]" />
                    {distanceLabel}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-slate-900">
              {formatTnd(listing.pricePerDay)}
            </div>
            <div className="text-xs text-slate-500">/ day</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.category?.name && (
            <span className="inline-flex rounded-full border border-border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
              {listing.category.name}
            </span>
          )}
          {matchBadges.map((b) => (
            <span
              key={b.label}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${b.color}`}
            >
              <i className={`fa-solid ${b.icon} text-[9px]`} />
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </Link>
    </div>
  );
}
