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
                    <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Array.from({ length: rows }).map((_, r) => (
                <tr key={r}>
                  {Array.from({ length: columns }).map((__, c) => (
                    <td key={c} className="px-6 py-4">
                      <div className="h-4 w-full max-w-[220px] bg-gray-200 rounded animate-pulse" />
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-20 bg-gray-200 rounded" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-4 w-5/6 bg-gray-200 rounded" />
        <div className="h-4 w-2/3 bg-gray-200 rounded" />
      </div>
      <div className="mt-6 h-10 w-40 bg-gray-200 rounded-lg" />
    </div>
  );
}

