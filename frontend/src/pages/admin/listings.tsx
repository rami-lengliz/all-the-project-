import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminListings } from '@/lib/api/hooks/useAdminListings';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminListingsPage() {
  const q = useAdminListings();

  const raw = (q.data as any) ?? [];
  const allItems = useMemo(
    () => (Array.isArray(raw) ? raw : (raw?.items ?? [])),
    [raw],
  );

  const [activeQueue, setActiveQueue] = useState<'PENDING' | 'ALL'>('PENDING');
  const items = useMemo(() => {
    if (activeQueue === 'PENDING') {
      return allItems.filter((l: any) => l.status === 'PENDING_REVIEW');
    }
    return allItems;
  }, [allItems, activeQueue]);

  return (
    <AdminLayout
      activeTab="listings"
      title="Listings"
      subtitle="Review listings and flag for moderation"
    >
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          {q.isError ? (
            <div className="mb-4">
              <InlineError
                message="Failed to load listings."
                onRetry={() => void q.refetch()}
              />
            </div>
          ) : null}

          <div className="mb-6 flex space-x-2 border-b border-gray-200">
            <button
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeQueue === 'PENDING'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveQueue('PENDING')}
            >
              Pending Review
            </button>
            <button
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeQueue === 'ALL'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveQueue('ALL')}
            >
              All Listings
            </button>
          </div>

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={5} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-layer-group"
              title="No listings found"
              message="There are no listings to review."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Listing
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Host
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Status
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Price/Day
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((l: any) => {
                      const active = l.isActive !== false;
                      const hostName = l.host?.name ?? '—';
                      const hostEmail = l.host?.email ?? '';
                      const img = l.images?.[0];

                      return (
                        <tr
                            key={l.id}
                            className="hover:bg-gray-50 transition"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 flex items-center justify-center">
                                  {img ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={
                                        img.startsWith('http') ||
                                        img.startsWith('/')
                                          ? img
                                          : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${img}`
                                      }
                                      alt={l.title}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src =
                                          '/placeholder.png';
                                        e.currentTarget.onerror = null;
                                      }}
                                    />
                                  ) : (
                                    <i className="fa-solid fa-image text-gray-400 text-2xl" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {l.title}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {l.address ?? ''}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">
                                {hostName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {hostEmail}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              {l.status === 'PENDING_REVIEW' ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-2" />
                                  Pending
                                </span>
                              ) : l.status === 'ACTIVE' ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2" />
                                  Suspended
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-900">
                                {formatTnd(Number(l.pricePerDay ?? 0))}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end space-x-2">
                                <Link
                                  href={`/listings/${l.id}`}
                                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                                >
                                  <i className="fa-solid fa-arrow-up-right-from-square text-gray-600 text-sm" />
                                </Link>
                                <Link
                                  href={`/admin/listings/${l.id}`}
                                  className="px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-lg transition"
                                >
                                  Review
                                </Link>
                              </div>
                            </td>
                          </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}
