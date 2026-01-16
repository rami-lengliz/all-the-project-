import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminUsers } from '@/lib/api/hooks/useAdminUsers';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminUsersPage() {
  const q = useAdminUsers();
  const users = (q.data as any) ?? [];
  const items = Array.isArray(users) ? users : users?.items ?? [];

  return (
    <AdminLayout activeTab="users" title="Users" subtitle="View user accounts and roles">
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          {q.isError ? <div className="mb-4"><InlineError message="Failed to load users." onRetry={() => void q.refetch()} /></div> : null}

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={4} />
          ) : items.length === 0 ? (
            <EmptyState icon="fa-solid fa-users" title="No users found" message="There are no user accounts to display." />
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Name</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Email</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Role</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((u: any) => {
                      const roles = (u.roles ?? []).map((r: any) => String(r).toLowerCase());
                      const roleLabel = roles.includes('admin') ? 'Admin' : u.isHost || roles.includes('host') ? 'Host' : 'User';
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
                            <p className="text-sm text-gray-900">{u.createdAt ? String(u.createdAt).slice(0, 10) : '—'}</p>
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

