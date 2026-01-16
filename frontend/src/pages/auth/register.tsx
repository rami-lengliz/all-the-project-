import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';

const schema = z
  .object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    password: z.string().min(6),
  })
  .refine((v) => (v.email && v.email.length > 0) || (v.phone && v.phone.length > 0), {
    message: 'Provide email or phone',
    path: ['email'],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', phone: '' } });

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Register</h1>
        <p className="mt-1 text-slate-600">Create your account to book and host.</p>

        <form
          className="mt-6 space-y-4 rounded-2xl border border-border bg-white p-6"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await register({
                name: values.name,
                email: values.email || undefined,
                phone: values.phone || undefined,
                password: values.password,
              });
              await router.push('/auth/login');
            } catch (e: any) {
              form.setError('root', { message: e?.message ? String(e.message) : 'Registration failed' });
            }
          })}
        >
          <div>
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Email (optional)</label>
            <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" {...form.register('email')} />
            {form.formState.errors.email ? (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Phone (optional)</label>
            <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" {...form.register('phone')} />
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
            {form.formState.isSubmitting ? 'Creating…' : 'Create account'}
          </button>

          {form.formState.errors.root ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div className="font-semibold">Registration failed</div>
              <div className="mt-2">{form.formState.errors.root.message}</div>
            </div>
          ) : null}

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold text-primary hover:text-primary-600">
              Login
            </Link>
          </p>
        </form>
      </div>
    </Layout>
  );
}

