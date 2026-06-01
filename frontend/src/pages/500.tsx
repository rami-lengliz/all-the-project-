import Link from 'next/link';
import Head from 'next/head';

export default function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>Something went wrong · RentEverything</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-rose-50 to-white px-6 text-center">
        <div className="relative mb-6">
          <span className="select-none text-[7rem] font-extrabold leading-none text-rose-500/15 sm:text-[9rem]">
            500
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-500 shadow-lg shadow-rose-500/30">
              <i className="fa-solid fa-screwdriver-wrench text-3xl text-white" />
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Something went wrong on our end
        </h1>
        <p className="mt-3 max-w-md text-gray-600">
          This one&apos;s on us, not you. Our team has been notified. Please try
          again in a moment.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-rose-600"
          >
            <i className="fa-solid fa-rotate-right mr-2" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <i className="fa-solid fa-house mr-2" />
            Back to home
          </Link>
        </div>
      </main>
    </>
  );
}
