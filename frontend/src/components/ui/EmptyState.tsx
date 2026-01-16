import Link from 'next/link';

export function EmptyState({
  icon,
  title,
  message,
  cta,
}: {
  icon: string; // Font Awesome classes, e.g. "fa-solid fa-box-open"
  title: string;
  message: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start">
        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
          <i className={`${icon} text-gray-600 text-xl`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{message}</p>
          {cta ? (
            <div className="mt-4">
              <Link
                href={cta.href}
                className="inline-flex items-center bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium shadow-md transition"
              >
                {cta.label}
                <i className="fa-solid fa-arrow-right ml-2" />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

