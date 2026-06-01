import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchListingAvailability,
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  setDatePrices,
  clearDatePrices,
  setMinNights,
  importIcal,
  removeIcal,
} from '@/lib/api/availability';

/** Booked + blocked ranges + per-date prices for a listing's calendar. */
export function useListingAvailability(id?: string) {
  return useQuery({
    queryKey: ['listing-availability', id],
    enabled: Boolean(id),
    queryFn: () => fetchListingAvailability(id as string),
    staleTime: 60_000,
  });
}

export function useCreateAvailabilityBlock(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { startDate: string; endDate: string; note?: string }) =>
      createAvailabilityBlock(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}

export function useDeleteAvailabilityBlock(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockId: string) => deleteAvailabilityBlock(id, blockId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}

export function useSetDatePrices(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { startDate: string; endDate: string; price: number }) =>
      setDatePrices(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}

export function useClearDatePrices(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (range: { from: string; to: string }) =>
      clearDatePrices(id, range.from, range.to),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}

export function useSetMinNights(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (minNights: number) => setMinNights(id, minNights),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}

export function useImportIcal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url?: string) => importIcal(id, url),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}

export function useRemoveIcal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeIcal(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['listing-availability', id] }),
  });
}
