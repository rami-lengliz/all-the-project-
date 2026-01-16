import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminLogs } from '@/lib/api/hooks/useAdminLogs';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminLogsPage() {
  const q = useAdminLogs(50);
  const raw = (q.data as any) ?? [];
  const items = Array.isArray(raw) ? raw : raw?.items ?? [];

  return (
    <AdminLayout activeTab="logs" title="Admin Logs" subtitle="Audit recent admin actions">
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          {q.isError ? <div className="mb-4"><InlineError message="Failed to load logs." onRetry={() => void q.refetch()} /></div> : null}

          {q.isLoading ? (
            <LoadingCard variant="table" rows={6} columns={3} />
          ) : items.length === 0 ? (
            <EmptyState icon="fa-solid fa-clipboard-list" title="No logs yet" message="Admin actions will appear here." />
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Action</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Target</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((log: any) => (
                      <tr key={log.id ?? `${log.action}-${log.createdAt}`} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{log.action ?? '—'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900">
                            {log.details?.listingId ?? log.details?.userId ?? log.actorId ?? '—'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900">{log.createdAt ? String(log.createdAt) : '—'}</p>
                        </td>
                      </tr>
                    ))}
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

