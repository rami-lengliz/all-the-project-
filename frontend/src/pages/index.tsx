import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useDebounce } from '@/lib/utils/useDebounce';

export default function HomePage() {
  const { locale, push } = useRouter();
  const [q, setQ] = useState('');
  const [where, setWhere] = useState('Kelibia, Tunisia');
  const dq = useDebounce(q, 350);

  return (
    <Layout>
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mx-auto mb-8 max-w-3xl text-center">
            <h1 className="mb-4 text-4xl font-extrabold text-slate-900 md:text-5xl">
              {locale === 'ar' ? 'استأجر كل شيء للسفر' : 'Rent everything for your trip'}
            </h1>
            <p className="text-lg text-slate-600">
              {locale === 'ar'
                ? 'إقامة، تنقل، وأنشطة شاطئية — اكتشف ما هو متاح قربك'
                : 'Accommodation, mobility, and beach activities — discover what’s available nearby.'}
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
              <div className="flex flex-col md:flex-row">
                <div className="flex-1 border-b border-border p-5 md:border-b-0 md:border-r">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {locale === 'ar' ? 'ماذا' : 'What'}
                  </label>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={locale === 'ar' ? 'ابحث عن فيلا، سيارة، كاياك…' : 'Search villa, car, kayak…'}
                    className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                <div className="flex-1 border-b border-border p-5 md:border-b-0 md:border-r">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {locale === 'ar' ? 'أين' : 'Where'}
                  </label>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-primary">
                      📍
                    </span>
                    <input
                      value={where}
                      onChange={(e) => setWhere(e.target.value)}
                      placeholder="Kelibia, Tunisia"
                      className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-center px-4 py-4 md:py-0">
                  <button
                    type="button"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-md transition hover:bg-primary-600"
                    aria-label="Search"
                    onClick={() =>
                      push({
                        pathname: '/search',
                        query: { q: dq || q || undefined, where: where || undefined },
                      })
                    }
                  >
                    🔎
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                className="text-sm text-slate-600 hover:text-slate-900"
                onClick={() => push({ pathname: '/search', query: { lat: 36.8578, lng: 11.092, radiusKm: 10 } })}
              >
                <span className="mr-2 text-primary" aria-hidden>
                  ⦿
                </span>
                {locale === 'ar' ? 'استخدم موقعي' : 'Use my current location (Kelibia demo)'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-bg py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">
              {locale === 'ar' ? 'استكشف بالخريطة' : 'Explore on the map'}
            </h2>
            <Link href="/map" className="text-sm font-semibold text-primary hover:text-primary-600">
              {locale === 'ar' ? 'عرض الخريطة' : 'View full map'} →
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-white p-6">
            <p className="text-slate-600">
              {locale === 'ar'
                ? 'افتح صفحة الخريطة للاستكشاف الكامل.'
                : 'Open the full map page for interactive exploration.'}
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
