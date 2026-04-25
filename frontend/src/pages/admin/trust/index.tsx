import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminSuspiciousUsers } from '@/lib/api/hooks/useAdminSuspiciousUsers';
import Link from 'next/link';
import { ShieldAlert, User, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function AdminTrustPage() {
  const { data: users, isLoading } = useAdminSuspiciousUsers();

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'RESTRICTED': return 'text-red-600 bg-red-50 border-red-100';
      case 'SUSPICIOUS': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'LIMITED': return 'text-yellow-600 bg-yellow-50 border-yellow-100';
      default: return 'text-green-600 bg-green-50 border-green-100';
    }
  };

  return (
    <AdminLayout
      activeTab="trust"
      title="User Trust & Abuse Review"
      subtitle="Monitor suspicious activity and chatbot security events"
    >
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <ShieldAlert className="mr-2 text-blue-600" size={20} />
              Suspicious User Queue
            </h2>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {users?.length || 0} users flagged
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-4"></div>
              <p className="text-gray-500">Loading suspicious activity...</p>
            </div>
          ) : !users || users.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="text-green-500" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">System Healthy</h3>
              <p className="text-gray-500">No users currently flagged for suspicious chatbot activity.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trust Tier</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Events</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{user.name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getTierColor(user.trustTier)}`}>
                          {user.trustTier}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                        {user.eventCount} events
                      </td>
                      <td className="px-6 py-4">
                        {user.suspendedAt ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 uppercase">Suspended</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase">Active</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/admin/trust/${user.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                        >
                          Review Activity
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </AdminLayout>
  );
}
