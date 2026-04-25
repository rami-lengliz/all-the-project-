import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminListingDetails } from '@/lib/api/hooks/useAdminListingDetails';
import { useAdminListingLogs } from '@/lib/api/hooks/useAdminListingLogs';
import { useAdminModerateListing } from '@/lib/api/hooks/useAdminModerateListing';
import { formatTnd, formatDate } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';

export default function AdminListingDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const { data: listing, isLoading, isError, refetch } = useAdminListingDetails(id);
  const { data: logsData } = useAdminListingLogs(id);
  const moderate = useAdminModerateListing();

  const [reason, setReason] = useState('');

  if (isLoading || !router.isReady) {
    return (
      <AdminLayout activeTab="listings" title="Loading..." subtitle="Fetching listing details">
        <LoadingCard variant="table" rows={4} columns={3} />
      </AdminLayout>
    );
  }

  if (isError || !listing) {
    return (
      <AdminLayout activeTab="listings" title="Error" subtitle="Listing not found">
        <InlineError message="Could not load listing details." onRetry={refetch} />
      </AdminLayout>
    );
  }

  const logs = Array.isArray(logsData) ? logsData : [];

  return (
    <AdminLayout
      activeTab="listings"
      title={`Reviewing: ${listing.title}`}
      subtitle="Moderation Detail View"
    >
      <div className="py-6 px-6 max-w-7xl mx-auto space-y-8">
        
        {/* Breadcrumb & Top Actions */}
        <div className="flex items-center space-x-4 mb-4">
          <Link href="/admin/listings" className="text-gray-500 hover:text-gray-700 transition">
            <i className="fa-solid fa-arrow-left mr-2" /> Back to Queue
          </Link>
          <StatusBadge status={listing.status} />
        </div>

        {moderate.isError && (
          <InlineError title="Action Failed" message="Please try again." />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Listing Details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-800 text-lg">Listing Information</h3>
                <span className="text-sm font-medium text-gray-500">{formatTnd(Number(listing.pricePerDay || 0))}/day</span>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-gray-700 leading-relaxed">{listing.description}</p>
                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                  <div>
                    <span className="text-gray-500 block mb-1">Category</span>
                    <span className="font-medium text-gray-900">{listing.category?.name || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">Location</span>
                    <span className="font-medium text-gray-900">{listing.address || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">Host</span>
                    <span className="font-medium text-gray-900">{listing.host?.name} ({listing.host?.email})</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">Created At</span>
                    <span className="font-medium text-gray-900">{formatDate(listing.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit History Panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-8">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-800 text-lg">Audit History</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">No moderation history found for this listing.</div>
                ) : (
                  logs.map((log: any) => (
                    <div key={log.id} className="px-6 py-4 flex flex-col space-y-2 text-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-gray-900 flex items-center">
                          <i className={`fa-solid fa-circle-check mr-2 ${log.action.includes('approve') ? 'text-green-500' : 'text-gray-400'}`} />
                          {log.action}
                        </span>
                        <span className="text-gray-500">{formatDate(log.createdAt)}</span>
                      </div>
                      <div className="text-gray-600 ml-6">
                        <p><strong>Actor:</strong> {log.actor?.name || log.actorId}</p>
                        {log.reason && <p><strong>Reason:</strong> {log.reason}</p>}
                        {log.previousStatus && (
                          <p><strong>Transition:</strong> {log.previousStatus} → {log.newStatus}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Moderation Panel */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-6">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-800 text-lg">Review Actions</h3>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Moderation reason (required for suspend)
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none"
                    placeholder="Provide a rationale for your decision..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-col space-y-3">
                  {listing.status !== 'ACTIVE' && (
                    <button
                      className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition disabled:opacity-60"
                      disabled={moderate.isPending}
                      onClick={() => {
                        moderate.mutate({
                          listingId: listing.id,
                          action: 'approve',
                          reason: reason.trim() || undefined,
                        }, {
                          onSuccess: () => {
                            setReason('');
                            refetch();
                          }
                        });
                      }}
                    >
                      <i className="fa-solid fa-check mr-2" /> Approve Listing
                    </button>
                  )}
                  
                  {listing.status !== 'SUSPENDED' && (
                    <button
                      className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition disabled:opacity-60"
                      disabled={!reason.trim() || moderate.isPending}
                      onClick={() => {
                        moderate.mutate({
                          listingId: listing.id,
                          action: 'suspend',
                          reason: reason.trim(),
                        }, {
                          onSuccess: () => {
                            setReason('');
                            refetch();
                          }
                        });
                      }}
                    >
                      <i className="fa-solid fa-ban mr-2" /> Suspend Listing
                    </button>
                  )}
                </div>
                
                <p className="text-xs text-gray-500 text-center mt-4">
                  Actions are logged securely to the audit trail.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'PENDING_REVIEW') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-2" /> Pending
      </span>
    );
  }
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" /> Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2" /> Suspended
    </span>
  );
}
