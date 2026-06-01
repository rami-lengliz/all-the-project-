export function LoadingCard({
  variant = 'card',
  rows = 3,
  columns = 5,
}: {
  variant?: 'card' | 'table';
  rows?: number;
  columns?: number;
}) {
  if (variant === 'table') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="text-left px-6 py-4">
                    <div className="h-3 w-24 rounded re-shimmer" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Array.from({ length: rows }).map((_, r) => (
                <tr key={r}>
                  {Array.from({ length: columns }).map((__, c) => (
                    <td key={c} className="px-6 py-4">
                      <div className="h-4 w-full max-w-[220px] rounded re-shimmer" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-40 rounded re-shimmer" />
        <div className="h-4 w-20 rounded re-shimmer" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-full rounded re-shimmer" />
        <div className="h-4 w-5/6 rounded re-shimmer" />
        <div className="h-4 w-2/3 rounded re-shimmer" />
      </div>
      <div className="mt-6 h-10 w-40 rounded-lg re-shimmer" />
    </div>
  );
}
