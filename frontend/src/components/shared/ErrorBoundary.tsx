import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '@/lib/monitoring/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches client-side React render errors anywhere in the tree and shows a
 * branded recovery card instead of letting the whole app unmount to a blank
 * white screen. (Next.js's /500 page only covers server-side errors.)
 *
 * Class component because error boundaries require getDerivedStateFromError /
 * componentDidCatch, which have no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info.componentStack);
    // Forward to Sentry with the React component stack (no-op until a DSN is set).
    captureException(error, { componentStack: info.componentStack });
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') window.location.reload();
  };

  private handleHome = (): void => {
    if (typeof window !== 'undefined') window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-rose-50 to-white px-6 text-center">
        <div className="relative mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-500 shadow-lg shadow-rose-500/30">
            <i className="fa-solid fa-triangle-exclamation text-3xl text-white" aria-hidden="true" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Something went wrong
        </h1>
        <p className="mt-3 max-w-md text-gray-600">
          The page hit an unexpected error. Reloading usually fixes it — your data
          is safe.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <i className="fa-solid fa-rotate-right mr-2" aria-hidden="true" />
            Reload page
          </button>
          <button
            type="button"
            onClick={this.handleHome}
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <i className="fa-solid fa-house mr-2" aria-hidden="true" />
            Back to home
          </button>
        </div>

        {process.env.NODE_ENV !== 'production' && this.state.error ? (
          <pre className="mt-8 max-w-xl overflow-auto rounded-lg bg-gray-900 p-4 text-left text-xs text-rose-200">
            {this.state.error.message}
          </pre>
        ) : null}
      </main>
    );
  }
}
