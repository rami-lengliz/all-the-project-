import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UsersService } from '@/lib/api/generated';
import type { BecomeHostDto } from '@/lib/api/generated';
import { refreshAccessToken } from '@/lib/auth/refresh';

export function useBecomeHost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const requestBody: BecomeHostDto = { acceptTerms: true };
      return await UsersService.usersControllerBecomeHost(requestBody);
    },
    onSuccess: async () => {
      // The DB now has isHost=true, but the current JWT still says role='USER'.
      // Force a token refresh so the next request carries role='HOST'.
      try {
        await refreshAccessToken();
      } catch {
        // If refresh fails the user will just need to log out and back in.
      }
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}
