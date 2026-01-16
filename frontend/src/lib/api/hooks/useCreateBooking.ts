import { useMutation } from '@tanstack/react-query';
import { BookingsService } from '@/lib/api/generated';
import type { CreateBookingDto } from '@/lib/api/generated/models/CreateBookingDto';
import type { Booking } from '@/lib/api/types';

export function useCreateBooking() {
  return useMutation({
    mutationFn: async (input: CreateBookingDto) => (await BookingsService.bookingsControllerCreate(input)) as Booking,
  });
}

