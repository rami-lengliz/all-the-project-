import { useMutation } from '@tanstack/react-query';
import { AuthService } from '@/lib/api/generated';
import type { LoginDto } from '@/lib/api/generated/models/LoginDto';

export function useLogin() {
  return useMutation({
    mutationFn: async (input: LoginDto) => AuthService.authControllerLogin(input) as Promise<any>,
  });
}

