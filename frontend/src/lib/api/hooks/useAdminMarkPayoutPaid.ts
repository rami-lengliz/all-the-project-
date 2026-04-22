import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface MarkPaidDto {
  method: string;
  reference: string;
}

export function useAdminMarkPayoutPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MarkPaidDto }) => {
      const res = await api.patch(`/admin/payouts/${id}/mark-paid`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['admin', 'payouts'] });
      qc.invalidateQueries({ queryKey: ['admin', 'payouts', variables.id] });
      qc.invalidateQueries({ queryKey: ['admin', 'ledger'] });
    },
  });
}
