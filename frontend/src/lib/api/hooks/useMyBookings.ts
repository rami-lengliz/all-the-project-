import { useQuery } from '@tanstack/react-query';
import { BookingsService } from '@/lib/api/generated';
import type { Booking } from '@/lib/api/types';

export function useMyBookings() {
  return useQuery({
    queryKey: ['bookings', 'me'],
    queryFn: async (): Promise<Booking[]> => {
      const res: any = await BookingsService.bookingsControllerFindAll();

      // Backend may wrap responses, e.g. { success, data }, or { data: { ... } }.
      // Always normalize to a plain array so pages can safely call .filter/.map.
      const candidates = [
        res,
        res?.data,
        res?.data?.data,
        res?.data?.data?.items,
        res?.data?.items,
        res?.items,
      ];

      for (const c of candidates) {
        if (Array.isArray(c)) return c as Booking[];
      }

      return [];
    },
  });
}

