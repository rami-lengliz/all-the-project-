import { useEffect, useState } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export type Toast = {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
};

declare global {
  // eslint-disable-next-line no-var
  var __RE_TOAST_PUSH__: ((toast: Omit<Toast, 'id'>) => void) | undefined;
}

export function toast(input: Omit<Toast, 'id'>) {
  globalThis.__RE_TOAST_PUSH__?.(input);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    globalThis.__RE_TOAST_PUSH__ = (t) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const toast: Toast = { id, ...t };
      setToasts((prev) => [toast, ...prev].slice(0, 3));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 3500);
    };
    return () => {
      globalThis.__RE_TOAST_PUSH__ = undefined;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 top-4 z-[1000] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'rounded-xl border bg-white px-4 py-3 shadow-lg',
            t.variant === 'success' && 'border-emerald-200',
            t.variant === 'error' && 'border-red-200',
            t.variant === 'info' && 'border-slate-200',
          ]
            .filter(Boolean)
            .join(' ')}
          role="status"
        >
          <div className="text-sm font-semibold text-slate-900">{t.title}</div>
          {t.message ? (
            <div className="mt-0.5 text-sm text-slate-600">{t.message}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

