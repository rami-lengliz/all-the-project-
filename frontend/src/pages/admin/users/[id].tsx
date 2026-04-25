import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminUserDetails } from '@/lib/api/hooks/useAdminUserDetails';
import { useAdminUserLogs } from '@/lib/api/hooks/useAdminUserLogs';
import { useAdminModerateUser } from '@/lib/api/hooks/useAdminModerateUser';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-2 text-xs text-blue-500 hover:text-blue-700 transition flex items-center"
      title="Copy ID"
    >
      <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-1`} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function AdminUserDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const { data: user, isLoading, isError, refetch } = useAdminUserDetails(id);
  const { data: logsData } = useAdminUserLogs(id);
  const moderate = useAdminModerateUser();

  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  if (isLoading || !router.isReady) {
    return (
      <AdminLayout activeTab="users" title="Loading..." subtitle="Fetching user details">
        <LoadingCard variant="table" rows={4} columns={3} />
      </AdminLayout>
    );
  }

  if (isError || !user) {
    return (
      <AdminLayout activeTab="users" title="Error" subtitle="User not found">
        <InlineError message="Could not load user details." onRetry={refetch} />
      </AdminLayout>
    );
  }

  const roles: string[] = (user.roles ?? []).map((r: any) => String(r).toLowerCase());
  const isSuspended = !!user.suspendedAt;
  const isAdmin = roles.includes('admin');
  const isHost = user.isHost || roles.includes('host');
  const roleLabel = isAdmin ? 'Admin' : isHost ? 'Host' : 'User';

  const logs: any[] = Array.isArray(logsData) ? logsData : [];
  const counts = user._count ?? {};

  const handleAction = () => {
    const action = isSuspended ? 'unsuspend' : 'suspend';
    if (!isSuspended && !reason.trim()) return;

    moderate.mutate({
      userId: user.id,
      action,
      reason: reason.trim() || undefined,
    }, {
      onSuccess: () => {
        setReason('');
        setShowConfirm(false);
        void refetch();
      }
    });
  };

  return (
    <AdminLayout
      activeTab="users"
      title={`Reviewing: ${user.name}`}
      subtitle="User Moderation Detail"
    >
      <div className="py-6 px-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

        {/* Breadcrumb & Global Status */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/admin/users" className="text-gray-500 hover:text-gray-700 transition flex items-center">
              <i className="fa-solid fa-arrow-left mr-2" /> Back to Users
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <span>ID: {user.id}</span>
              <CopyButton text={user.id} />
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {isSuspended ? (
              <div className="flex flex-col items-end">
                <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold bg-red-100 text-red-800 shadow-sm">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse" />
                  Suspended
                </span>
                <span className="text-[10px] text-red-500 mt-1 font-medium italic">
                  Since {formatDateTime(user.suspendedAt)}
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold bg-green-100 text-green-800 shadow-sm border border-green-200">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                Active Account
              </span>
            )}
          </div>
        </div>

        {moderate.isError && (
          <InlineError title="Action Failed" message={moderate.error instanceof Error ? moderate.error.message : 'Please try again.'} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: User Details + Counts + Audit */}
          <div className="lg:col-span-2 space-y-6">

            {/* User Header Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-lg">User Profile</h3>
                <span className="text-xs font-mono text-gray-400">v1.2.0-moderation</span>
              </div>
              <div className="px-6 py-6">
                <div className="flex items-center space-x-5 mb-8">
                  <div className="relative">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="w-20 h-20 rounded-2xl object-cover ring-4 ring-gray-50 shadow-sm"
                        onError={(e) => { e.currentTarget.src = '/placeholder.png'; e.currentTarget.onerror = null; }}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center ring-4 ring-gray-50 shadow-sm">
                        <i className="fa-solid fa-user text-blue-300 text-3xl" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">{user.name}</h2>
                    <div className="flex items-center mt-1 space-x-2">
                       <p className="text-sm text-gray-500 font-medium">{user.email ?? 'No email'}</p>
                       <div className="w-1 h-1 bg-gray-300 rounded-full" />
                       <p className="text-sm text-gray-500 font-medium">{user.phone ?? 'No phone'}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block mb-1">Authorization</span>
                    <span className="font-bold text-gray-900 flex items-center">
                      <i className={`fa-solid ${isAdmin ? 'fa-shield-halved text-purple-500' : isHost ? 'fa-house-user text-blue-500' : 'fa-user text-gray-500'} mr-2`} />
                      {roleLabel}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block mb-1">Member Since</span>
                    <span className="font-bold text-gray-900">{formatDate(user.createdAt)}</span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block mb-1">Trust Profile</span>
                    <span className="font-bold text-gray-900 flex items-center">
                      <i className="fa-solid fa-star text-yellow-400 mr-2" />
                      {Number(user.ratingAvg).toFixed(1)} <span className="text-gray-400 font-normal ml-1">({user.ratingCount})</span>
                    </span>
                  </div>
                  <div className="p-2 border-l-4 border-green-400">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Identity</span>
                    <div className="flex gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${user.verifiedEmail ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Email</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${user.verifiedPhone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Phone</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Activity Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Listings', count: counts.listings ?? 0, icon: 'fa-box', color: 'blue' },
                { label: 'Renter Bookings', count: counts.bookingsAsRenter ?? 0, icon: 'fa-cart-shopping', color: 'indigo' },
                { label: 'Host Bookings', count: counts.bookingsAsHost ?? 0, icon: 'fa-calendar-check', color: 'teal' },
              ].map((c) => (
                <div key={c.label} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-xl bg-${c.color}-50 flex items-center justify-center`}>
                    <i className={`fa-solid ${c.icon} text-${c.color}-500 text-xl`} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-900 leading-none">{c.count}</p>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-tight mt-1">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Moderation History */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-lg">Moderation History</h3>
                <i className="fa-solid fa-clock-rotate-left text-gray-300" />
              </div>
              <div className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-400 flex flex-col items-center">
                    <i className="fa-solid fa-shield-cat text-4xl mb-3 text-gray-100" />
                    <p className="text-sm font-medium tracking-tight">No incident history recorded for this user.</p>
                  </div>
                ) : (
                  logs.map((log: any) => (
                    <div key={log.id} className="px-6 py-5 hover:bg-gray-50 transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-gray-900 flex items-center text-sm uppercase tracking-tight">
                          <i className={`fa-solid fa-square mr-2 text-[10px] ${
                            log.action === 'unsuspend_user' ? 'text-green-500' :
                            log.action === 'suspend_user' ? 'text-red-500' : 'text-gray-400'
                          }`} />
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] font-bold text-gray-400">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <div className="ml-5 space-y-2 border-l-2 border-gray-100 pl-4 py-1">
                        <p className="text-[13px] text-gray-600">
                          <span className="font-bold text-gray-900">Operator:</span> {log.actor?.name ?? log.actor?.id ?? 'System'}
                        </p>
                        {log.reason && (
                          <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 text-[13px] text-gray-600 italic">
                             &quot;{log.reason}&quot;
                          </div>
                        )}
                        {log.previousSuspendedAt !== undefined && (
                          <p className="text-[11px] text-gray-400 font-medium">
                            Status change: {log.previousSuspendedAt ? 'Suspended' : 'Active'} → {log.newSuspendedAt ? 'Suspended' : 'Cleared'}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Moderation Actions */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-xl overflow-hidden sticky top-6">
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
                <h3 className="font-bold text-gray-900 text-lg tracking-tight">Decision Panel</h3>
              </div>
              <div className="p-6 space-y-6">
                {isAdmin && (
                  <div className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-4 text-sm text-purple-900 flex items-start space-x-3 shadow-inner">
                    <i className="fa-solid fa-shield-halved mt-0.5 text-purple-500" />
                    <div>
                        <p className="font-black">Protected Account</p>
                        <p className="text-xs font-medium opacity-80 mt-0.5">Admin profiles possess suspension immunity. Modification requires database-level intervention.</p>
                    </div>
                  </div>
                )}

                <div className={isAdmin ? 'opacity-30 pointer-events-none grayscale' : ''}>
                  <label className="block text-xs font-black text-gray-900 uppercase tracking-widest mb-3">
                    Moderation Rationale {isSuspended ? '(Optional)' : '(Required)'}
                  </label>
                  <textarea
                    className={`w-full border ${!isSuspended && !reason.trim() ? 'border-gray-200 focus:border-red-500 ring-red-100' : 'border-gray-200 focus:border-blue-500 ring-blue-100'} rounded-2xl px-5 py-4 text-gray-900 text-sm focus:outline-none focus:ring-4 min-h-[140px] resize-none transition-all placeholder:text-gray-300 font-medium`}
                    placeholder="Enter explicit reason for audit trail..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isAdmin || moderate.isPending}
                  />
                  {!isSuspended && !reason.trim() && (
                    <p className="text-[10px] text-red-500 font-bold mt-2 uppercase tracking-tighter ml-1">Reason required for account suspension</p>
                  )}
                </div>

                <div className="relative pt-2">
                  {!showConfirm ? (
                    <button
                      className={`w-full flex items-center justify-center font-black py-4 px-6 rounded-2xl shadow-lg transition-all transform active:scale-95 disabled:grayscale disabled:opacity-50 ${
                        isSuspended 
                          ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-200' 
                          : 'bg-red-600 hover:bg-red-700 text-white shadow-red-200'
                      }`}
                      disabled={isAdmin || (!isSuspended && !reason.trim()) || moderate.isPending}
                      onClick={() => setShowConfirm(true)}
                    >
                      <i className={`fa-solid ${isSuspended ? 'fa-unlock' : 'fa-ban'} mr-2`} />
                      {isSuspended ? 'Unsuspend Account' : 'Suspend Account'}
                    </button>
                  ) : (
                    <div className="space-y-3 animate-in zoom-in-95 duration-200">
                       <p className="text-center text-[10px] font-black uppercase text-gray-500 tracking-widest">Confirm Critical Action</p>
                       <div className="flex gap-2">
                          <button
                            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold py-3 px-4 rounded-xl transition"
                            onClick={() => setShowConfirm(false)}
                            disabled={moderate.isPending}
                          >
                             Cancel
                          </button>
                          <button
                            className={`flex-1 font-bold py-3 px-4 rounded-xl text-white shadow-md ${isSuspended ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                            onClick={handleAction}
                            disabled={moderate.isPending}
                          >
                             {moderate.isPending ? 'Working...' : 'Confirm'}
                          </button>
                       </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-center space-x-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                       <i className="fa-solid fa-fingerprint" />
                       <span>Immutable Audit Trace Active</span>
                    </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-start space-x-3">
               <i className="fa-solid fa-circle-info text-blue-400 mt-0.5" />
               <p className="text-[11px] text-gray-500 leading-relaxed font-medium">Suspension blocks all logins and immediately terminates existing sessions via token validation check (JWT/Refresh).</p>
            </div>
          </div>

        </div>
      </div>
    </AdminLayout>
  );
}
