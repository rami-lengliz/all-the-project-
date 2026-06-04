import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import { toast } from '@/components/ui/Toaster';

interface KycStatus {
  state: 'none' | 'pending' | 'verified' | 'rejected';
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  hasDocument: boolean;
}

export function KycUploadCard() {
  const queryClient = useQueryClient();
  const statusQ = useQuery({
    queryKey: ['kyc', 'me'],
    queryFn: async () => (await api.get('/kyc/me')).data as KycStatus,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: 'File too large',
        message: 'Maximum 8 MB.',
        variant: 'error',
      });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('document', file);
      await api.post('/kyc/me/submit', form);
      toast({
        title: 'ID submitted',
        message: 'An admin will review it within 1-2 business days.',
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['kyc', 'me'] });
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (statusQ.isLoading) return null;
  const s = statusQ.data;
  if (!s) return null;

  const stateBadge =
    s.state === 'verified' ? (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <i className="fa-solid fa-shield-check mr-1" />
        Verified host
      </span>
    ) : s.state === 'pending' ? (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <i className="fa-solid fa-clock mr-1" />
        Under review
      </span>
    ) : s.state === 'rejected' ? (
      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
        <i className="fa-solid fa-circle-xmark mr-1" />
        Rejected
      </span>
    ) : (
      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700">
        Not submitted
      </span>
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Identity verification</h3>
          <p className="mt-1 text-sm text-gray-600">
            Hosts who upload a government ID earn a <strong>Verified host</strong>{' '}
            badge. Renters book verified hosts ~3× more often.
          </p>
        </div>
        {stateBadge}
      </div>

      {s.state === 'rejected' && s.rejectionReason ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <strong>Rejected:</strong> {s.rejectionReason}
          <p className="mt-1 text-xs text-rose-700">
            Upload a clearer image of your CIN or passport to try again.
          </p>
        </div>
      ) : null}

      {s.state === 'verified' ? (
        <p className="mt-4 text-xs text-gray-500">
          Verified on{' '}
          {s.verifiedAt ? new Date(s.verifiedAt).toLocaleDateString() : ''}.
        </p>
      ) : (
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <i className="fa-solid fa-id-card" />
            {uploading
              ? 'Uploading…'
              : s.state === 'pending'
                ? 'Replace document'
                : s.state === 'rejected'
                  ? 'Upload new document'
                  : 'Upload your ID'}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            CIN or passport. JPEG / PNG / WebP, ≤ 8 MB. Your document is shown
            only to RentAI administrators.
          </p>
        </div>
      )}
    </div>
  );
}
