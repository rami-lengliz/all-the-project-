import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminListings } from '@/lib/api/hooks/useAdminListings';
import { useAdminFlagListing } from '@/lib/api/hooks/useAdminFlagListing';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminListingsPage() {
  const q = useAdminListings();
  const flag = useAdminFlagListing();

  const raw = (q.data as any) ?? [];
  const items = useMemo(() => (Array.isArray(raw) ? raw : raw?.items ?? []), [raw]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');

  return (
    <AdminLayout activeTab="listings" title="Listings" subtitle="Review listings and flag for moderation">
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          {q.isError ? <div className="mb-4"><InlineError message="Failed to load listings." onRetry={() => void q.refetch()} /></div> : null}
          {flag.isError ? <div className="mb-4"><InlineError title="Could not flag listing" message="Please try again." /></div> : null}

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={5} />
          ) : items.length === 0 ? (
            <EmptyState icon="fa-solid fa-layer-group" title="No listings found" message="There are no listings to review." />
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Listing</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Host</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Price/Day</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((l: any) => {
                      const active = l.isActive !== false;
                      const hostName = l.host?.name ?? '—';
                      const hostEmail = l.host?.email ?? '';
                      const img = l.images?.[0];
                      const isOpen = openId === l.id;

                      return (
                        <>
                          <tr key={l.id} className="hover:bg-gray-50 transition">
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 flex items-center justify-center">
                                  {img ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={img} alt={l.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <i className="fa-solid fa-image text-gray-400 text-2xl" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{l.title}</p>
                                  <p className="text-sm text-gray-500">{l.address ?? ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">{hostName}</p>
                              <p className="text-xs text-gray-500">{hostEmail}</p>
                            </td>
                            <td className="px-6 py-4">
                              {active ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-2" />
                                  Paused
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-900">{formatTnd(Number(l.pricePerDay ?? 0))}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end space-x-2">
                                <Link href={`/listings/${l.id}`} className="p-2 hover:bg-gray-100 rounded-lg transition">
                                  <i className="fa-solid fa-arrow-up-right-from-square text-gray-600 text-sm" />
                                </Link>
                                <button
                                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                                  type="button"
                                  onClick={() => {
                                    setOpenId(isOpen ? null : l.id);
                                    setReason('');
                                  }}
                                >
                                  <i className="fa-solid fa-flag text-gray-600 text-sm" />
                                </button>
                                <button className="p-2 hover:bg-gray-100 rounded-lg transition" type="button">
                                  <i className="fa-solid fa-ellipsis-vertical text-gray-600 text-sm" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr key={`${l.id}-flag`}>
                              <td className="px-6 py-5 bg-gray-50" colSpan={5}>
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 mr-4">
                                    <label className="block text-xs font-semibold text-gray-700 mb-2">Flag reason</label>
                                    <input
                                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="Describe why this listing should be reviewed…"
                                      value={reason}
                                      onChange={(e) => setReason(e.target.value)}
                                    />
                                  </div>
                                  <div className="flex items-center space-x-3">
                                    <button
                                      className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-5 rounded-lg transition"
                                      type="button"
                                      onClick={() => setOpenId(null)}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition disabled:opacity-60"
                                      type="button"
                                      disabled={!reason.trim() || flag.isPending}
                                      onClick={() => flag.mutate({ listingId: l.id, reason: reason.trim() })}
                                    >
                                      {flag.isPending ? 'Flagging…' : 'Flag listing'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </>
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

