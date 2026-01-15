import Link from 'next/link';
import { useRouter } from 'next/router';

export type CategorySlug = 'accommodation' | 'mobility' | 'water-beach-activities';

const CATEGORIES: Array<{ slug: CategorySlug; labelEn: string; labelAr: string; icon: string }> = [
  { slug: 'accommodation', labelEn: 'Accommodation', labelAr: 'إقامة', icon: '🏠' },
  { slug: 'mobility', labelEn: 'Mobility', labelAr: 'تنقل', icon: '🚗' },
  { slug: 'water-beach-activities', labelEn: 'Water & Beach', labelAr: 'شاطئ وماء', icon: '🏖️' },
];

export function CategoryStrip() {
  const { locale } = useRouter();

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {CATEGORIES.map((c) => (
        <Link
          key={c.slug}
          href={{ pathname: '/search', query: { categorySlug: c.slug } }}
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span aria-hidden>{c.icon}</span>
          <span>{locale === 'ar' ? c.labelAr : c.labelEn}</span>
        </Link>
      ))}
    </div>
  );
}

