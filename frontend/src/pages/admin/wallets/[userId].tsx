import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminWalletDetail } from '@/lib/api/hooks/useAdminWalletDetail';
import { useAdminWalletAdjust, WalletAdjustDto } from '@/lib/api/hooks/useAdminWalletAdjust';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { formatTnd } from '@/lib/utils/format';

const TX_TYPE_LABELS: Record<string, string> = {
  TOP_UP: 'Top-Up',
  PAYMENT: 'Booking Payment',
  REFUND: 'Refund',
  ADJUSTMENT: 'Admin Adjustment',
};

const TX_TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  TOP_UP: { bg: 'bg-green-100', text: 'text-green-600', icon: 'fa-arrow-down' },
  PAYMENT: { bg: 'bg-orange-100', text: 'text-orange-600', icon: 'fa-arrow-up' },
  REFUND: { bg: 'bg-blue-100', text: 'text-blue-600', icon: 'fa-arrow-rotate-left' },
  ADJUSTMENT: { bg: 'bg-purple-100', text: 'text-purple-600', icon: 'fa-sliders' },
};

export default function AdminWalletDetailPage() {
  const router = useRouter();
  const { userId } = router.query;
  const userIdStr = typeof userId === 'string' ? userId : undefined;

  const { data, isLoading, isError, refetch } = useAdminWalletDetail(userIdStr);
  const adjustMutation = useAdminWalletAdjust(userIdStr);

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDirection, setAdjustDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState(false);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      setAdjustError('Amount must be a positive number.');
      return;
    }
    if (adjustReason.trim().length < 5) {
      setAdjustError('Reason must be at least 5 characters.');
      return;
    }

    setAdjustError(null);
    setAdjustSuccess(false);

    try {
      await adjustMutation.mutateAsync({
        amount,
        direction: adjustDirection,
        reason: adjustReason.trim(),
      });
      setAdjustAmount('');
      setAdjustReason('');
      setAdjustSuccess(true);
      setTimeout(() => setAdjustSuccess(false), 4000);
      void refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.body?.message ||
        err?.message ||
        'Adjustment failed.';
      setAdjustError(typeof msg === 'string' ? msg : 'Adjustment failed.');
    }
  };

  const user = data?.user;
  const wallet = data?.wallet;
  const transactions = data?.transactions ?? [];
  const topUpIntents = (data as any)?.topUpIntents ?? [];

  return (
    <AdminLayout
      activeTab="wallets"
      title={user ? `Wallet: ${user.name}` : 'Wallet Detail'}
      subtitle={user ? user.email : ''}
    >
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <Link
          href="/admin/wallets"
          className="text-sm text-gray-500 hover:text-gray-900 transition flex items-center"
        >
          <i className="fa-solid fa-arrow-left mr-2" />
          Back to Wallets
        </Link>

        {isError && (
          <InlineError message="Failed to load wallet detail." onRetry={refetch} />
        )}

        {isLoading ? (
          <LoadingCard />
        ) : (
          <>
            {/* Balance + User Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
                <p className="text-indigo-100 text-sm font-medium mb-1">Current Balance</p>
                <p className="text-4xl font-bold mb-3">
                  {formatTnd(wallet?.balance ?? 0)}
                </p>
                <p className="text-indigo-200 text-xs">
                  {wallet?.currency ?? 'TND'} • Updated {wallet?.updatedAt ? new Date(wallet.updatedAt).toLocaleString() : '—'}
                </p>
              </div>

              <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4">User Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Name</p>
                    <p className="font-medium text-gray-900">{user?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{user?.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Roles</p>
                    <p className="font-medium text-gray-900">{(user?.roles ?? []).join(', ') || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    {user?.suspendedAt ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Suspended
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-500">Wallet Created</p>
                    <p className="font-medium text-gray-900">
                      {wallet?.createdAt ? new Date(wallet.createdAt).toLocaleDateString() : 'Not yet'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total Transactions</p>
                    <p className="font-medium text-gray-900">{transactions.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Adjustment Panel */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-sliders text-purple-500" />
                  <h3 className="font-semibold text-gray-800">Admin Adjustment</h3>
                </div>
                <button
                  onClick={() => setShowAdjust(!showAdjust)}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center"
                >
                  {showAdjust ? 'Hide' : 'New Adjustment'}
                  <i className={`fa-solid fa-chevron-${showAdjust ? 'up' : 'down'} ml-2 text-xs`} />
                </button>
              </div>

              {showAdjust && (
                <div className="p-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Credit or debit a user's wallet with a mandatory reason. This creates a <strong>WalletTransaction</strong>,
                    a <strong>LedgerEntry</strong>, and an <strong>AdminLog</strong> entry for full auditability.
                  </p>

                  {adjustError && (
                    <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200 flex items-center">
                      <i className="fa-solid fa-circle-exclamation mr-2 text-red-500" />
                      {adjustError}
                    </div>
                  )}

                  {adjustSuccess && (
                    <div className="mb-4 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200 flex items-center">
                      <i className="fa-solid fa-circle-check mr-2 text-green-500" />
                      Adjustment applied successfully.
                    </div>
                  )}

                  <form onSubmit={handleAdjust} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
                        <select
                          value={adjustDirection}
                          onChange={(e) => setAdjustDirection(e.target.value as 'CREDIT' | 'DEBIT')}
                          className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
                        >
                          <option value="CREDIT">Credit (add funds)</option>
                          <option value="DEBIT">Debit (remove funds)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount (TND)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={adjustAmount}
                          onChange={(e) => { setAdjustAmount(e.target.value); setAdjustError(null); }}
                          className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
                          placeholder="25.00"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={adjustMutation.isPending}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                          {adjustMutation.isPending ? (
                            <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                          ) : (
                            <i className="fa-solid fa-check mr-2" />
                          )}
                          Apply
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required for audit)</label>
                      <textarea
                        value={adjustReason}
                        onChange={(e) => { setAdjustReason(e.target.value); setAdjustError(null); }}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
                        placeholder="e.g., Goodwill credit for support ticket #1234"
                        rows={2}
                        required
                      />
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Transaction History</h3>
                <span className="text-sm text-gray-500">{transactions.length} transactions</span>
              </div>
              <div className="divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fa-solid fa-receipt text-2xl text-gray-400" />
                    </div>
                    <p className="font-medium">No transactions yet</p>
                  </div>
                ) : (
                  transactions.map((tx: any) => {
                    const style = TX_TYPE_COLORS[tx.type] ?? TX_TYPE_COLORS.ADJUSTMENT;
                    const isCredit = ['TOP_UP', 'REFUND'].includes(tx.type) ||
                      (tx.type === 'ADJUSTMENT' && tx.balanceAfter > tx.balanceBefore);
                    return (
                      <div key={tx.id} className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition">
                        <div className="flex items-center space-x-4">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center ${style.bg} ${style.text}`}>
                            <i className={`fa-solid ${style.icon}`} />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{TX_TYPE_LABELS[tx.type] ?? tx.type}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(tx.createdAt).toLocaleString()}
                              {tx.referenceId && (
                                <span className="ml-2">
                                  • Ref: <span className="font-mono">{tx.referenceId.slice(0, 8)}</span>
                                </span>
                              )}
                              {tx.ledgerEntry?.metadata?.reason && (
                                <span className="ml-2 text-purple-600">
                                  • {(tx.ledgerEntry.metadata as any).reason}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${isCredit ? 'text-green-600' : 'text-gray-900'}`}>
                            {isCredit ? '+' : '-'}{formatTnd(tx.amount)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTnd(tx.balanceBefore)} → {formatTnd(tx.balanceAfter)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Konnect Top-Up Intents */}
            {topUpIntents.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Konnect</span>
                    <h3 className="font-semibold text-gray-800">Top-Up Intents</h3>
                  </div>
                  <span className="text-sm text-gray-500">{topUpIntents.length} intents</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Provider</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Provider Ref</th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Paid At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {topUpIntents.map((intent: any) => (
                        <tr key={intent.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4 text-gray-700">{new Date(intent.createdAt).toLocaleString()}</td>
                          <td className="px-6 py-4 text-gray-700 capitalize">{intent.provider}</td>
                          <td className="px-6 py-4 font-mono text-xs text-gray-500">
                            {intent.providerRef ? intent.providerRef.slice(0, 24) + (intent.providerRef.length > 24 ? '…' : '') : '—'}
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">{formatTnd(intent.amount)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase ${
                              intent.status === 'processed' ? 'bg-green-100 text-green-700' :
                              intent.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {intent.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {intent.paidAt ? new Date(intent.paidAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
