import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminCategoryRequests } from '@/lib/api/hooks/useAdminCategoryRequests';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoriesService } from '@/lib/api/generated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toaster';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default function AdminCategoryRequestsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const q = useAdminCategoryRequests(statusFilter);
  const items: any[] = Array.isArray(q.data) ? q.data : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewingReq, setReviewingReq] = useState<any | null>(null);
  
  const [formData, setFormData] = useState({
    action: 'APPROVED' as any,
    adminNotes: '',
    resolvedCategoryId: '',
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      return CategoriesService.categoriesControllerReviewRequest(reviewingReq.id, {
        action: formData.action,
        adminNotes: formData.adminNotes || undefined,
        resolvedCategoryId: formData.resolvedCategoryId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'category-requests'] });
      toast({ title: 'Success', message: 'Category request reviewed.', variant: 'success' });
      setIsModalOpen(false);
      setReviewingReq(null);
    },
    onError: (err: any) => {
      toast({ title: 'Error', message: err?.body?.message || err?.message || 'Failed to review request.', variant: 'error' });
    },
  });

  const handleReview = (req: any) => {
    setReviewingReq(req);
    setFormData({
      action: 'APPROVED',
      adminNotes: '',
      resolvedCategoryId: '',
    });
    setIsModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5 rounded">Pending</span>;
      case 'APPROVED':
        return <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded">Approved</span>;
      case 'REJECTED':
        return <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 rounded">Rejected</span>;
      case 'MERGED':
        return <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">Merged</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 text-xs font-semibold px-2.5 py-0.5 rounded">{status}</span>;
    }
  };

  return (
    <AdminLayout activeTab="categories" title="Category Requests" subtitle="Review taxonomy additions requested by hosts">
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center mb-6">
            <Link href="/admin/categories" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              &larr; Back to Categories
            </Link>
            
            <div className="flex space-x-2">
               {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'MERGED'].map(st => (
                 <button
                   key={st}
                   onClick={() => setStatusFilter(st === 'ALL' ? undefined : st)}
                   className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${
                     (statusFilter === st || (st === 'ALL' && !statusFilter))
                       ? 'bg-blue-50 text-blue-700 border-blue-200'
                       : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                   }`}
                 >
                   {st}
                 </button>
               ))}
            </div>
          </div>

          {q.isError ? (
            <div className="mb-4">
              <InlineError message="Failed to load requests." onRetry={() => void q.refetch()} />
            </div>
          ) : null}

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-inbox"
              title="No requests found"
              message="No hosts have requested new categories."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Proposed Name</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Requester</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Reason</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Requested</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((req: any) => (
                    <tr key={req.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-semibold text-gray-900">{req.proposedName}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{req.requester?.name}</p>
                        <p className="text-xs text-gray-500">{req.requester?.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600 max-w-xs truncate" title={req.reason || ''}>
                          {req.reason || <span className="text-gray-400 italic">No reason provided</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(req.status)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {req.status === 'PENDING' ? (
                          <button
                            onClick={() => handleReview(req)}
                            className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                          >
                            Review
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Review Modal */}
      {isModalOpen && reviewingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Review Request</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fa-solid fa-times" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-1">Proposed Category: {reviewingReq.proposedName}</h4>
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Requester:</span> {reviewingReq.requester?.name} ({reviewingReq.requester?.email})
                </p>
                {reviewingReq.reason && (
                  <div className="mt-2 text-sm text-blue-800 bg-blue-100/50 p-2 rounded">
                    <span className="font-medium">Reason:</span> "{reviewingReq.reason}"
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Decision *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value as any })}
                >
                  <option value="APPROVED">Approve (Will create/expect new category)</option>
                  <option value="MERGED">Merge into existing category</option>
                  <option value="REJECTED">Reject</option>
                </select>
              </div>

              {formData.action === 'MERGED' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Category ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="UUID of the category to merge into"
                    value={formData.resolvedCategoryId}
                    onChange={(e) => setFormData({ ...formData, resolvedCategoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the ID of the existing category. The requester should use this instead.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Admin Notes</label>
                <textarea
                  placeholder="Optional notes for internal audit"
                  rows={3}
                  value={formData.adminNotes}
                  onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 mt-auto">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => reviewMutation.mutate()}
                disabled={reviewMutation.isPending || (formData.action === 'MERGED' && !formData.resolvedCategoryId)}
                className={`px-6 py-2 text-white rounded-lg transition disabled:opacity-50 font-medium ${
                  formData.action === 'REJECTED' ? 'bg-red-600 hover:bg-red-700' : 
                  formData.action === 'MERGED' ? 'bg-indigo-600 hover:bg-indigo-700' :
                  'bg-green-600 hover:bg-green-700'
                }`}
              >
                {reviewMutation.isPending ? 'Processing...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
