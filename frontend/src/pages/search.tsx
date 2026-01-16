import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useListings } from '@/lib/api/hooks/useListings';
import { ListingCard } from '@/components/shared/ListingCard';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function SearchPage() {
  const router = useRouter();
  const q = typeof router.query.q === 'string' ? router.query.q : undefined;
  const category = typeof router.query.category === 'string' ? router.query.category : undefined;

  const query = useListings({
    q,
    category,
    limit: 30,
    page: 1,
  });

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Search</h1>
        <p className="mt-2 text-slate-600">
          {q ? (
            <>
              Query: <span className="font-semibold text-slate-900">{q}</span>
            </>
          ) : (
            'Browse listings'
          )}
          {category ? (
            <>
              {' '}
              • Category: <span className="font-semibold text-slate-900">{category}</span>
            </>
          ) : null}
        </p>

        <div className="mt-6">
          {query.isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : query.isError ? (
            <InlineError message="Failed to load listings." onRetry={() => void query.refetch()} />
          ) : (query.data as any)?.items?.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(query.data as any).items.map((l: any) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-solid fa-magnifying-glass"
              title="No results"
              message="Try a different search."
              cta={{ label: 'Clear filters', href: '/search' }}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

