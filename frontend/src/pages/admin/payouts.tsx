import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminPayouts } from '@/lib/api/hooks/useAdminPayouts';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils/format';

export default function AdminPayoutsPage() {
  const { data, isLoading, isError, refetch } = useAdminPayouts();
  const payouts = data?.payouts ?? [];

  return (
    <AdminLayout
      activeTab="payouts"
      title="Payout Management"
      subtitle="Review and process platform payouts to hosts"
    >
      <div className="max-w-7xl mx-auto px-6 py-10">
        {isError && (
          <InlineError message="Failed to load payouts." onRetry={refetch} />
        )}

        {isLoading ? (
          <LoadingCard variant="table" rows={6} columns={5} />
        ) : payouts.length === 0 ? (
          <EmptyState
            icon="fa-solid fa-money-bill-transfer"
            title="No payouts found"
            message="There are no payout requests to display."
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                      Payout ID
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                      Host
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                      Amount
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                      Status
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                      Created At
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {payouts.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <p className="text-xs font-mono text-gray-500">{p.id.split('-').shift()}-...</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900">{p.host?.name}</p>
                        <p className="text-xs text-gray-500">{p.host?.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{p.amount} {p.currency}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          p.status === 'PAID' ? 'bg-green-100 text-green-700' :
                          p.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/admin/payouts/${p.id}`}
                          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 font-medium rounded hover:bg-blue-100 transition"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
