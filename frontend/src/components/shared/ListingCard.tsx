import Link from 'next/link';
import type { Listing } from '@/lib/api/types';
import { formatTnd } from '@/lib/utils/format';

export function ListingCard({ listing }: { listing: Listing }) {
  const city = listing.address?.split(',').slice(-2).join(',').trim() || listing.address || 'Kelibia';
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="aspect-[16/10] bg-slate-100 overflow-hidden">
        {listing.images && listing.images.length > 0 ? (
          <img
            src={`http://localhost:3000${listing.images[0]}`}
            alt={listing.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
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
            <div className="text-sm font-semibold text-slate-900 group-hover:text-primary">{listing.title}</div>
            <div className="mt-1 text-xs text-slate-500">{city}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-slate-900">{formatTnd(listing.pricePerDay)}</div>
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
  );
}

