import Link from 'next/link';
import type { Listing } from '@/lib/api/types';
import { formatTnd } from '@/lib/utils/format';
import { useCompare } from '@/lib/context/CompareContext';

export function ListingCard({ listing }: { listing: Listing }) {
  const { selectedIds, toggleListing, isMaxSelected } = useCompare();
  const isSelected = selectedIds.includes(listing.id);

  const city =
    listing.address?.split(',').slice(-2).join(',').trim() ||
    listing.address ||
    'Kelibia';

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:shadow-md">
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
            <div className="mt-1 text-xs text-slate-500">{city}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-slate-900">
              {formatTnd(listing.pricePerDay)}
            </div>
            <div className="text-xs text-slate-500">/ day</div>
          </div>
        </div>
        {listing.category?.name ? (
          <div className="mt-3 inline-flex rounded-full border border-border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            {listing.category.name}
          </div>
        ) : null}
      </div>
    </Link>
    </div>
  );
}
