import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UsersService } from '@/lib/api/generated';
import type { BecomeHostDto } from '@/lib/api/generated';

export function useBecomeHost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Backend expects EXACTLY: { acceptTerms: true }
      // Do NOT send email, password, user object, or empty body
      const requestBody: BecomeHostDto = { acceptTerms: true };

      // Defensive console.log in dev mode only
      if (process.env.NODE_ENV === 'development') {
        console.log('[useBecomeHost] Sending request body:', JSON.stringify(requestBody, null, 2));
      }

      try {
        return await UsersService.usersControllerBecomeHost(requestBody);
      } catch (error: any) {
        // Log full error response for debugging
        // OpenAPI client throws ApiError with status, body, statusText directly
        if (process.env.NODE_ENV === 'development') {
          console.error('[useBecomeHost] Full error object:', error);
          console.error('[useBecomeHost] Error status:', error?.status);
          console.error('[useBecomeHost] Error statusText:', error?.statusText);
          console.error('[useBecomeHost] Error body (full):', JSON.stringify(error?.body, null, 2));
          console.error('[useBecomeHost] Error body.message:', error?.body?.message);
          console.error('[useBecomeHost] Error message:', error?.message);
        }
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate profile query to refetch updated user data
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}
