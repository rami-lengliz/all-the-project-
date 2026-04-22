import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminPayoutDetails } from '@/lib/api/hooks/useAdminPayoutDetails';
import { useAdminMarkPayoutPaid } from '@/lib/api/hooks/useAdminMarkPayoutPaid';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { formatDate, formatDateTime } from '@/lib/utils/format';

export default function AdminPayoutDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const { data: payout, isLoading, isError, refetch } = useAdminPayoutDetails(id);
  const markPaid = useAdminMarkPayoutPaid();

  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');

  if (isLoading || !router.isReady) {
    return (
      <AdminLayout activeTab="payouts" title="Loading..." subtitle="Fetching payout details">
        <LoadingCard variant="table" rows={4} columns={3} />
      </AdminLayout>
    );
  }

  if (isError || !payout) {
    return (
      <AdminLayout activeTab="payouts" title="Error" subtitle="Payout not found">
        <InlineError message="Could not load payout details." onRetry={refetch} />
      </AdminLayout>
    );
  }

  const handleMarkPaid = async () => {
    if (!method || !reference) return;
    try {
      await markPaid.mutateAsync({
        id,
        data: { method, reference },
      });
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AdminLayout
      activeTab="payouts"
      title={`Payout: ${payout.id.split('-').shift()}`}
      subtitle="Detailed payout reconciliation"
    >
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-center space-x-4">
          <Link href="/admin/payouts" className="text-sm font-medium text-blue-600 hover:underline">
            ← Back to Payouts
          </Link>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            payout.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {payout.status}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
               <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="font-semibold text-gray-800">Payout Items</h3>
                  <p className="text-xs text-gray-500 mt-1">Ledger entries reconciled in this payout</p>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white border-b border-gray-200">
                      <tr>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Booking ID</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Entry Type</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Booking Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payout.items.map((item: any) => (
                        <tr key={item.id} className="text-sm">
                          <td className="px-6 py-4 font-mono text-xs text-gray-400">
                             {item.ledgerEntry?.bookingId.split('-').shift()}...
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                             {item.ledgerEntry?.type}
                          </td>
                          <td className="px-6 py-4 font-semibold text-gray-900">
                             {item.ledgerEntry?.amount} TND
                          </td>
                          <td className="px-6 py-4">
                             <span className="text-xs text-gray-500">{item.ledgerEntry?.booking?.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
               <h3 className="font-semibold text-gray-800 border-b border-gray-100 pb-2">Host Details</h3>
               <div>
                  <p className="text-sm font-bold text-gray-900">{payout.host?.name}</p>
                  <p className="text-xs text-gray-500">{payout.host?.email}</p>
               </div>
               <div className="pt-2">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Total Amount</p>
                  <p className="text-2xl font-black text-blue-600">{payout.amount} {payout.currency}</p>
               </div>
            </div>

            {payout.status === 'PENDING' ? (
              <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm space-y-4">
                <h3 className="font-bold text-blue-800 text-sm uppercase tracking-wider">Process Settlement</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-blue-700 mb-1">Payment Method</label>
                    <select 
                      className="w-full border border-blue-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      <option value="">Select Method</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-700 mb-1">Transaction Reference</label>
                    <input 
                      type="text"
                      className="w-full border border-blue-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. TR-99228811"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                  <button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition disabled:opacity-50"
                    disabled={!method || !reference || markPaid.isPending}
                    onClick={handleMarkPaid}
                  >
                    {markPaid.isPending ? 'Processing...' : 'Confirm Payment'}
                  </button>
                  <p className="text-[10px] text-blue-600 text-center italic">
                    This will mark the payout as PAID and post a Debit ledger entry.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 p-6 rounded-xl border border-green-100 shadow-sm space-y-3">
                <h3 className="font-bold text-green-800 text-sm uppercase tracking-wider">Settlement Success</h3>
                <div className="space-y-2 text-sm">
                   <p className="flex justify-between">
                      <span className="text-green-600 font-medium">Method:</span>
                      <span className="font-bold text-green-800">{payout.method}</span>
                   </p>
                   <p className="flex justify-between">
                      <span className="text-green-600 font-medium">Reference:</span>
                      <span className="font-bold text-green-800">{payout.reference}</span>
                   </p>
                   <p className="flex justify-between">
                      <span className="text-green-600 font-medium">Paid At:</span>
                      <span className="font-bold text-green-800">{formatDateTime(payout.paidAt)}</span>
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
