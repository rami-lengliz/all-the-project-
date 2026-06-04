import Link from 'next/link';
import Head from 'next/head';

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page not found · RentAI</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-6 text-center">
        <div className="relative mb-6">
          <span className="select-none text-[7rem] font-extrabold leading-none text-blue-500/15 sm:text-[9rem]">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30">
              <i className="fa-solid fa-compass text-3xl text-white" />
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-3 max-w-md text-gray-600">
          The link may be broken, or the listing might have been removed. Let&apos;s
          get you back to something rentable.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-blue-600"
          >
            <i className="fa-solid fa-house mr-2" />
            Back to home
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <i className="fa-solid fa-magnifying-glass mr-2" />
            Browse rentals
          </Link>
        </div>

        <Link
          href="/help"
          className="mt-6 text-sm text-blue-500 transition hover:text-blue-600 hover:underline"
        >
          Need help? Visit our help center
        </Link>
      </main>
    </>
  );
}
