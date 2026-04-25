import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminUsers } from '@/lib/api/hooks/useAdminUsers';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils/format';

export default function AdminUsersPage() {
  const q = useAdminUsers();
  const raw = (q.data as any) ?? [];
  const items: any[] = Array.isArray(raw) ? raw : (raw?.items ?? []);

  return (
    <AdminLayout
      activeTab="users"
      title="Users"
      subtitle="Manage user accounts and moderation"
    >
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          {q.isError ? (
            <div className="mb-4">
              <InlineError
                message="Failed to load users."
                onRetry={() => void q.refetch()}
              />
            </div>
          ) : null}

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={5} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-users"
              title="No users found"
              message="There are no user accounts to display."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Name
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Email
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Role
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Status
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Joined
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((u: any) => {
                      const roles: string[] = (u.roles ?? []).map((r: any) =>
                        String(r).toLowerCase(),
                      );
                      const isSuspended = !!u.suspendedAt;
                      const isAdmin = roles.includes('admin');
                      const isHost = u.isHost || roles.includes('host');

                      const roleLabel = isAdmin ? 'Admin' : isHost ? 'Host' : 'User';

                      return (
                        <tr key={u.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-gray-900">{u.name}</p>
                            <p className="text-sm text-gray-500">{u.phone ?? ''}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-900">{u.email ?? '—'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {roleLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {isSuspended ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2" />
                                Suspended
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-900">{formatDate(u.createdAt)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end">
                              <Link
                                href={`/admin/users/${u.id}`}
                                className="px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-lg transition"
                              >
                                Review
                              </Link>
                            </div>
                          </td>
                        </tr>
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
