import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminLedgerSummary } from '@/lib/api/hooks/useAdminLedgerSummary';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { formatDate } from '@/lib/utils/format';

export default function AdminLedgerPage() {
  const { data: summary, isLoading, isError, refetch } = useAdminLedgerSummary();

  return (
    <AdminLayout
      activeTab="ledger"
      title="Financial Ledger"
      subtitle="Platform-wide financial integrity and summary"
    >
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {isError && (
          <InlineError message="Failed to load ledger summary." onRetry={refetch} />
        )}

        {isLoading ? (
          <LoadingCard variant="table" rows={3} columns={4} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500 mb-1">Gross Volume</p>
              <p className="text-xl font-bold text-gray-900">
                {summary?.gross} {summary?.currency}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
              <p className="text-sm font-medium text-gray-500 mb-1">Commission</p>
              <p className="text-xl font-bold text-blue-600">
                {summary?.commission} {summary?.currency}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500 mb-1">Host Net Due</p>
              <p className="text-xl font-bold text-gray-900">
                {summary?.hostNet} {summary?.currency}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-yellow-400">
              <p className="text-sm font-medium text-gray-500 mb-1">Frozen (Disputed)</p>
              <p className="text-xl font-bold text-yellow-600">
                {summary?.disputedAmount} {summary?.currency}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{summary?.disputeCount} active disputes</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500 mb-1">Refunds</p>
              <p className="text-xl font-bold text-red-600">
                {summary?.refunds} {summary?.currency}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Operational Integrity</h3>
            <div className="flex items-center space-x-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <i className="fa-solid fa-shield-check text-green-500" />
              <span>Immutable Ledger active</span>
            </div>
          </div>
          <div className="p-6 text-sm text-gray-600 space-y-4">
            <p>
              The ledger tracks all capture and refund events. Payouts are generated based on host net balance 
              calculated from these entries. Note that bookings with <strong>OPEN disputes</strong> are automatically 
              excluded from payout eligibility to protect platform funds.
            </p>
            <div className="flex items-center space-x-4">
               <div className="flex items-center px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full font-medium">
                  <i className="fa-solid fa-snowflake mr-2" />
                  Dispute Freeze: Enabled
               </div>
               <div className="flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                  <i className="fa-solid fa-shield-halved mr-2" />
                  Refund Guardrail: Enabled
               </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
