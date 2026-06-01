import { useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api/http';
import { toast } from '@/components/ui/Toaster';

type Reason =
  | 'NOT_AS_DESCRIBED'
  | 'DAMAGED'
  | 'NO_SHOW'
  | 'CANCELLED_LATE'
  | 'PAYMENT_ISSUE'
  | 'OTHER';

const REASON_LABELS: Record<Reason, string> = {
  NOT_AS_DESCRIBED: "Wasn't as described",
  DAMAGED: 'Damaged',
  NO_SHOW: 'No-show',
  CANCELLED_LATE: 'Cancelled too late',
  PAYMENT_ISSUE: 'Payment / refund issue',
  OTHER: 'Other',
};

export function OpenDisputeModal({
  bookingId,
  open,
  onClose,
}: {
  bookingId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<Reason>('NOT_AS_DESCRIBED');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (description.trim().length < 10) {
      toast({
        title: 'Tell us more',
        message: 'Description must be at least 10 characters.',
        variant: 'error',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/disputes', {
        bookingId,
        reason,
        description,
      });
      const id = res.data?.id;
      toast({
        title: 'Dispute opened',
        message: 'Our team will review it shortly.',
        variant: 'success',
      });
      onClose();
      if (id) router.push(`/disputes/${id}`);
    } catch (e: any) {
      toast({
        title: "Couldn't open dispute",
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-modal-title"
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id="dispute-modal-title" className="text-lg font-bold text-gray-900">Report an issue</h2>
          <p className="mt-1 text-xs text-gray-500">
            Opening a dispute holds the host payout until our team reviews the case.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              What happened?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(REASON_LABELS) as Reason[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition ${
                    reason === r
                      ? 'border-rose-400 bg-rose-50 text-rose-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Describe the problem
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="When did it happen? What was wrong? Anything our team should know?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              You can add photos after opening the dispute.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
          >
            {submitting ? 'Opening…' : 'Open dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}
