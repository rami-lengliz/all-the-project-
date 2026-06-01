import Link from 'next/link';
import { useListings } from '@/lib/api/hooks/useListings';
import { ListingCard } from '@/components/shared/ListingCard';
import { LoadingCard } from '@/components/ui/LoadingCard';

interface CategoryRowProps {
  category: { id: string; name: string; slug: string };
  lat: number;
  lng: number;
  radiusKm: number;
}

/**
 * A single "Netflix-style" row of listings for one category on the home page.
 * Renders nothing once loaded if the category has no listings nearby, so the
 * caller can map over all categories without worrying about empties.
 */
export function CategoryRow({ category, lat, lng, radiusKm }: CategoryRowProps) {
  const { data, isLoading } = useListings({
    category: category.id,
    lat,
    lng,
    radiusKm,
    limit: 8,
    sortBy: 'distance',
  });

  const items = data?.items ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <div className="mb-10 last:mb-0">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">{category.name}</h3>
        <Link
          href={`/search?categorySlug=${category.slug}&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`}
          className="text-sm font-medium text-blue-500 transition hover:text-blue-600"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)
          : items.slice(0, 4).map((listing) => (
              <ListingCard key={listing.id} listing={listing as any} />
            ))}
      </div>
    </div>
  );
}
