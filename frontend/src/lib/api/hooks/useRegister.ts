import { useMutation } from '@tanstack/react-query';
import { AuthService } from '@/lib/api/generated';
import type { RegisterDto } from '@/lib/api/generated/models/RegisterDto';
import { ApiError } from '@/lib/api/generated/core/ApiError';

export type RegisterValidationError = {
  kind: 'validation';
  status: 400;
  messages: string[];
};

function toMessages(body: unknown): string[] {
  if (!body) return [];
  if (typeof body === 'string') return [body];
  if (Array.isArray(body)) return body.filter((x): x is string => typeof x === 'string');
  if (typeof body === 'object') {
    const b = body as any;
    const msg = b.message ?? b.error ?? b.errors;
    return toMessages(msg);
  }
  return [String(body)];
}

export function useRegister() {
  return useMutation({
    mutationFn: async (input: RegisterDto) => {
      try {
        return (await AuthService.authControllerRegister(input)) as any;
      } catch (err) {
        // Handle backend structured 400 validation errors without crashing the page.
        if (err instanceof ApiError && err.status === 400) {
          const messages = toMessages(err.body);
          const e: RegisterValidationError = {
            kind: 'validation',
            status: 400,
            messages: messages.length ? messages : ['Invalid registration data'],
          };
          throw e;
        }
        throw err;
      }
    },
  });
}

