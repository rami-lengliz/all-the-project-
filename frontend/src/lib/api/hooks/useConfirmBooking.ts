import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookingsService } from '@/lib/api/generated';

export function useConfirmBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => BookingsService.bookingsControllerConfirm(bookingId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['bookings', 'me'] });
    },
  });
}

