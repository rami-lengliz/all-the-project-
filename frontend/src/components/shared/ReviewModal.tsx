import { useState } from 'react';
import { useSubmitReview } from '@/lib/api/hooks/useSubmitReview';
import { toast } from '@/components/ui/Toaster';

interface Props {
  bookingId: string;
  targetName: string;
  role: 'renter' | 'host'; // who is submitting
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReviewModal({ bookingId, targetName, role, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const submit = useSubmitReview();

  const label = role === 'renter' ? 'Review the host' : 'Review the renter';
  const placeholder =
    role === 'renter'
      ? 'How was your experience with this host and listing?'
      : 'How was this renter?';

  const handleSubmit = async () => {
    if (rating < 1) {
      toast({ title: 'Rating required', message: 'Please select a star rating.', variant: 'error' });
      return;
    }
    try {
      await submit.mutateAsync({ bookingId, rating, comment: comment.trim() || undefined });
      toast({ title: 'Review submitted', message: 'Thank you for your feedback!', variant: 'success' });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error?.message ??
        e?.response?.data?.message ??
        e?.message ??
        'Please try again.';
      toast({ title: 'Could not submit review', message: msg, variant: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close review dialog"
          className="absolute top-4 right-4 rounded-lg text-gray-400 transition hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
        </button>

        <h2 id="review-modal-title" className="text-lg font-bold text-gray-900 mb-1">{label}</h2>
        <p className="text-sm text-gray-500 mb-5">
          Reviewing <span className="font-semibold text-gray-700">{targetName}</span>
        </p>

        {/* Star selector */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
              aria-pressed={star <= rating}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="rounded text-3xl transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <i
                aria-hidden="true"
                className={`fa-star ${
                  star <= (hovered || rating) ? 'fa-solid text-yellow-400' : 'fa-regular text-gray-300'
                }`}
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-sm font-semibold text-gray-600">
              {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][rating]}
            </span>
          )}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
          maxLength={1000}
        />
        <p className="text-xs text-gray-400 mt-1 text-right">{comment.length}/1000</p>

        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            disabled={submit.isPending}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submit.isPending || rating < 1}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl py-2.5 text-sm font-bold transition"
          >
            {submit.isPending ? (
              <><i className="fa-solid fa-spinner fa-spin mr-2" />Submitting…</>
            ) : (
              'Submit review'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
