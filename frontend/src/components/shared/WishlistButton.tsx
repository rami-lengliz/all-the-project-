import { useState } from 'react';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';
import { toast } from '@/components/ui/Toaster';
import { useWishlistIds, useInvalidateWishlist } from '@/lib/api/hooks/useWishlist';

interface Props {
  listingId: string;
  variant?: 'circle' | 'inline';
  className?: string;
}

export function WishlistButton({ listingId, variant = 'circle', className }: Props) {
  const { user } = useAuth();
  const ids = useWishlistIds();
  const invalidate = useInvalidateWishlist();
  const saved = ids.has(listingId);
  const [submitting, setSubmitting] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      window.location.href = `/auth/login?next=${encodeURIComponent(`/listings/${listingId}`)}`;
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (saved) {
        await api.delete(`/wishlist/${listingId}`);
      } else {
        await api.post(`/wishlist/${listingId}`);
        toast({ title: 'Saved to your wishlist', variant: 'success' });
      }
      await invalidate();
    } catch {
      toast({ title: "Couldn't update wishlist", message: 'Please try again.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const heartIcon = (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill={saved ? '#f43f5e' : 'none'}
      stroke={saved ? '#f43f5e' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        aria-pressed={saved}
        aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      >
        {heartIcon}
        {saved ? 'Saved' : 'Save'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={submitting}
      className={
        className ??
        'absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md hover:scale-105 transition disabled:opacity-60'
      }
      aria-pressed={saved}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
    >
      {heartIcon}
    </button>
  );
}
