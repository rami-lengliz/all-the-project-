import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WalletService } from '../generated';
import { ApiError } from '../generated';
import { api } from '../http';

export interface TopUpDto {
  amount: number;
}

export const walletKeys = {
  all: ['wallet'] as const,
  me: () => [...walletKeys.all, 'me'] as const,
};

export function useWallet() {
  return useQuery({
    queryKey: walletKeys.me(),
    queryFn: () => WalletService.walletControllerGetWallet(),
    retry: false,
  });
}

export function useTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation<any, ApiError, TopUpDto>({
    mutationFn: async (data: TopUpDto) => {
      const res = await api.post('/wallet/topup', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.me() });
    },
  });
}

export function useKonnectTopUp() {
  return useMutation<{ redirectUrl: string }, ApiError, { amount: number }>({
    mutationFn: async (data) => {
      const res = await api.post('/wallet/konnect/topup', data);
      return res.data;
    },
  });
}
