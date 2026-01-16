import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminUsers } from '@/lib/api/hooks/useAdminUsers';
import { useAdminListings } from '@/lib/api/hooks/useAdminListings';
import { useAdminLogs } from '@/lib/api/hooks/useAdminLogs';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';

export default function AdminDashboardPage() {
  const usersQ = useAdminUsers();
  const listingsQ = useAdminListings();
  const logsQ = useAdminLogs(10);

  const users = (usersQ.data as any) ?? [];
  const listings = (listingsQ.data as any) ?? [];
  const logs = (logsQ.data as any) ?? [];

  return (
    <AdminLayout activeTab="dashboard" title="Admin Dashboard" subtitle="Monitor users, listings, and moderation activity">
      <section id="earnings-summary" className="py-8">
        <div className="max-w-7xl mx-auto px-6">
          {usersQ.isLoading || listingsQ.isLoading || logsQ.isLoading ? (
            <div className="grid grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-users text-blue-600 text-xl" />
                </div>
                <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-1 rounded-full">Users</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Total Users</h3>
              <p className="text-3xl font-bold text-gray-900">{Array.isArray(users) ? users.length : users?.items?.length ?? 0}</p>
              <p className="text-xs text-gray-500 mt-2">All accounts</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-layer-group text-purple-600 text-xl" />
                </div>
                <span className="text-xs text-gray-500 font-medium">Listings</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Total Listings</h3>
              <p className="text-3xl font-bold text-gray-900">
                {Array.isArray(listings) ? listings.length : listings?.items?.length ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-2">All listings</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-flag text-yellow-500 text-xl" />
                </div>
                <span className="text-xs text-gray-500 font-medium">Logs</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Recent Logs</h3>
              <p className="text-3xl font-bold text-gray-900">{Array.isArray(logs) ? logs.length : logs?.items?.length ?? 0}</p>
              <p className="text-xs text-gray-500 mt-2">Latest actions</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-shield-halved text-green-600 text-xl" />
                </div>
                <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full">OK</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Moderation</h3>
              <p className="text-3xl font-bold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-2">System status</p>
            </div>
          </div>
          )}

          {(usersQ.isError || listingsQ.isError || logsQ.isError) ? (
            <div className="mt-4">
              <InlineError title="Some admin data failed to load" message="You can still navigate, or retry now." onRetry={() => { void usersQ.refetch(); void listingsQ.refetch(); void logsQ.refetch(); }} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-3 gap-6">
            <Link href="/admin/users" className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900">Manage Users</h3>
                <i className="fa-solid fa-arrow-right text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">View user accounts and roles</p>
            </Link>
            <Link href="/admin/listings" className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900">Moderate Listings</h3>
                <i className="fa-solid fa-arrow-right text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">Flag listings for review</p>
            </Link>
            <Link href="/admin/logs" className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900">Admin Logs</h3>
                <i className="fa-solid fa-arrow-right text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">Audit recent admin actions</p>
            </Link>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}

