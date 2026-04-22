function getErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return 'Please try again.';
}

export function InlineError({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: unknown;
  onRetry?: () => void;
}) {
  const safeMessage = getErrorMessage(message);

  return (
    <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
      <div className="flex items-start">
        <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mr-4">
          <i className="fa-solid fa-triangle-exclamation text-red-600 text-xl" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{safeMessage}</p>
          {onRetry ? (
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex items-center border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-5 py-2.5 rounded-lg transition"
                onClick={onRetry}
              >
                <i className="fa-solid fa-rotate-right mr-2" />
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
