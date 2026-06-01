import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { api } from '@/lib/api/http';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';
import { API_URL } from '@/lib/api/env';

interface PendingRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  idDocumentUrl: string | null;
  idSubmittedAt: string | null;
  idRejectedAt: string | null;
  idRejectionReason: string | null;
}

export default function AdminKycPage() {
  const queryClient = useQueryClient();
  const pendingQ = useQuery({
    queryKey: ['admin', 'kyc', 'pending'],
    queryFn: async () =>
      (await api.get('/kyc/admin/pending')).data as PendingRow[],
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'kyc', 'pending'] });

  return (
    <AdminLayout
      activeTab="kyc"
      title="Host KYC"
      subtitle="Review identity documents submitted by hosts. Approve to grant the Verified host badge; reject with a clear reason so they can re-submit."
    >
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          {pendingQ.isLoading ? (
            <LoadingCard />
          ) : pendingQ.isError ? (
            <InlineError
              message="Could not load the KYC queue."
              onRetry={() => pendingQ.refetch()}
            />
          ) : (pendingQ.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-solid fa-shield-check"
              title="Inbox zero"
              message="No KYC submissions are waiting."
            />
          ) : (
            <div className="space-y-4">
              {(pendingQ.data ?? []).map((row) => (
                <KycRow key={row.id} row={row} onChange={refresh} />
              ))}
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}

function KycRow({
  row,
  onChange,
}: {
  row: PendingRow;
  onChange: () => void;
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const docUrl = row.idDocumentUrl
    ? row.idDocumentUrl.startsWith('http')
      ? row.idDocumentUrl
      : `${API_URL}${row.idDocumentUrl}`
    : null;

  const approve = async () => {
    setSubmitting(true);
    try {
      await api.post(`/kyc/admin/${row.id}/approve`);
      toast({ title: 'Host verified', variant: 'success' });
      onChange();
    } catch (e: any) {
      toast({
        title: 'Approve failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (reason.trim().length < 4) {
      toast({
        title: 'Reason required',
        message: 'Tell the host why so they can fix it.',
        variant: 'error',
      });
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/kyc/admin/${row.id}/reject`, { reason });
      toast({ title: 'Submission rejected', variant: 'success' });
      onChange();
    } catch (e: any) {
      toast({
        title: 'Reject failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          {docUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={docUrl}
              alt={`${row.name} ID`}
              className="w-full rounded-lg border border-gray-200 object-cover"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-100 text-gray-400">
              <i className="fa-solid fa-image text-3xl" />
            </div>
          )}
        </div>

        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center gap-3">
            {row.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.avatarUrl}
                alt={row.name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                <i className="fa-solid fa-user" />
              </div>
            )}
            <div>
              <div className="font-semibold text-gray-900">{row.name}</div>
              <div className="text-xs text-gray-500">
                {row.email ?? '—'}
                {row.phone ? ` · ${row.phone}` : ''}
              </div>
            </div>
            {!row.isHost ? (
              <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Not yet a host
              </span>
            ) : null}
          </div>

          {row.idSubmittedAt ? (
            <div className="text-xs text-gray-500">
              Submitted {new Date(row.idSubmittedAt).toLocaleString()}
            </div>
          ) : null}
          {row.idRejectedAt && row.idRejectionReason ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              Previously rejected: {row.idRejectionReason}
            </div>
          ) : null}

          {rejectMode ? (
            <div className="space-y-2">
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason shown to the host (e.g. 'Image too blurry — please re-upload')"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reject}
                  disabled={submitting}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
                >
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectMode(false);
                    setReason('');
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={approve}
                disabled={submitting}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                <i className="fa-solid fa-check mr-1" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectMode(true)}
                disabled={submitting}
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                <i className="fa-solid fa-xmark mr-1" />
                Reject
              </button>
              {docUrl ? (
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Open full size
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
