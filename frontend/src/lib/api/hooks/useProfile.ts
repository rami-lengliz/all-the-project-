import { useQuery } from '@tanstack/react-query';
import { UsersService } from '@/lib/api/generated';
import type { User } from '@/lib/api/types';

export function useProfile() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const response = await UsersService.usersControllerGetProfile();
      // Backend wraps response in { success: true, data: {...} }
      // Extract the actual user data
      const userData = (response as any)?.data ?? response;
      return userData as User;
    },
  });
}

