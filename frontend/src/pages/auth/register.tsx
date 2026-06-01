import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';

const schema = z
  .object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    password: z.string().min(6),
  })
  .refine(
    (v) => (v.email && v.email.length > 0) || (v.phone && v.phone.length > 0),
    {
      message: 'Provide email or phone',
      path: ['email'],
    },
  );

type FormValues = z.infer<typeof schema>;

function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function friendlyRegisterError(e: any): string {
  const status = e?.status ?? e?.response?.status;
  const body = e?.body ?? e?.response?.data;
  const msg = String(
    body?.error?.message ?? body?.message ?? e?.message ?? '',
  ).toLowerCase();
  if (msg.includes('email already')) return 'That email is already registered. Try logging in instead.';
  if (msg.includes('phone already')) return 'That phone number is already registered. Try logging in instead.';
  if (msg.includes('either email or phone')) return 'Please provide either an email or a phone number.';
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Registration failed. Please try again.';
}

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', phone: '' },
  });
  const next = safeNext(router.query.next);

  const destination = (): string => (next !== '/' ? next : '/');

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-slate-600">
          Takes about a minute. You can change your mind later.
        </p>

        <form
          className="mt-6 space-y-5 rounded-2xl border border-border bg-white p-6"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await register({
                name: values.name,
                email: values.email || undefined,
                phone: values.phone || undefined,
                password: values.password,
              });
              // register() auto-logs in — honor ?next= if present, else go home
              await router.push(destination());
            } catch (e: any) {
              form.setError('root', { message: friendlyRegisterError(e) });
            }
          })}
        >
          <div>
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Email (optional)
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('email')}
            />
            {form.formState.errors.email ? (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Phone (optional)
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('phone')}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('password')}
            />
            <p className="mt-1 text-xs text-slate-500">
              At least 6 characters.
            </p>
            {form.formState.errors.password ? (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {form.formState.isSubmitting
              ? 'Creating account…'
              : 'Create account'}
          </button>

          {form.formState.errors.root ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div className="font-semibold">Registration failed</div>
              <div className="mt-2">{form.formState.errors.root.message}</div>
            </div>
          ) : null}

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link
              href={next === '/' ? '/auth/login' : `/auth/login?next=${encodeURIComponent(next)}`}
              className="font-semibold text-primary hover:text-primary-600"
            >
              Login
            </Link>
          </p>

          <SocialAuthButtons
            next={destination()}
            disabled={form.formState.isSubmitting}
          />
        </form>
      </div>
    </Layout>
  );
}
