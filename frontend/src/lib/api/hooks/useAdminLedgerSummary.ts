import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminLedgerSummary(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin', 'ledger', 'summary', { from, to }],
    queryFn: async () => {
      const res = await api.get('/admin/ledger/summary', { params: { from, to } });
      return res.data?.data ?? res.data;
    },
  });
}
