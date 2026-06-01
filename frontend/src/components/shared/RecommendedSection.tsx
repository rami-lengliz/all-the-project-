import { ListingCard } from '@/components/shared/ListingCard';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { useRecommendedListings } from '@/lib/api/hooks/useRecommendedListings';

interface Props {
  title: string;
  subtitle?: string;
  limit?: number;
  lat?: number;
  lng?: number;
  /** Show the section even when there are no results (renders nothing in that case). */
  hideWhenEmpty?: boolean;
}

/**
 * Reusable "Recommended for you" carousel. Used on the wishlist empty state,
 * the search idle hero, the search zero-results fallback, and anywhere else
 * we want to surface personalized picks. Hides itself when the engine has
 * nothing useful to show, so it never feels like a dead section.
 */
export function RecommendedSection({
  title,
  subtitle,
  limit = 4,
  lat,
  lng,
  hideWhenEmpty = true,
}: Props) {
  const { data, isLoading, isError } = useRecommendedListings({ limit, lat, lng });

  if (isError) return null;
  if (!isLoading && (data ?? []).length === 0 && hideWhenEmpty) return null;

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: limit }).map((_, i) => (
            <LoadingCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(data ?? []).map((l) => (
            <ListingCard key={l.id} listing={l as any} reason={l._reasons?.[0]} />
          ))}
        </div>
      )}
    </section>
  );
}
