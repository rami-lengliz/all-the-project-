import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';

const schema = z.object({
  emailOrPhone: z.string().min(3),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Login</h1>
        <p className="mt-1 text-slate-600">Access your rentals and host tools.</p>

        <form
          className="mt-6 space-y-4 rounded-2xl border border-border bg-white p-6"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await login(values);
              await router.push('/');
            } catch (e: any) {
              form.setError('root', { message: e?.message ? String(e.message) : 'Login failed' });
            }
          })}
        >
          <div>
            <label className="text-sm font-medium text-slate-700">Email or phone</label>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('emailOrPhone')}
            />
            {form.formState.errors.emailOrPhone ? (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.emailOrPhone.message}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.password.message}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {form.formState.isSubmitting ? 'Logging in…' : 'Login'}
          </button>

          {form.formState.errors.root ? (
            <p className="text-center text-sm text-red-600">{form.formState.errors.root.message}</p>
          ) : null}

          <p className="text-center text-sm text-slate-600">
            No account?{' '}
            <Link href="/auth/register" className="font-semibold text-primary hover:text-primary-600">
              Register
            </Link>
          </p>
        </form>
      </div>
    </Layout>
  );
}

