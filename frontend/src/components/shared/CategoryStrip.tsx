import Link from 'next/link';
import { useRouter } from 'next/router';

export type CategorySlug =
  | 'stays'
  | 'sports-facilities'
  | 'mobility'
  | 'beach-gear';

const CATEGORIES: Array<{
  slug: CategorySlug;
  labelEn: string;
  labelAr: string;
  icon: string;
}> = [
  {
    slug: 'stays',
    labelEn: 'Stays',
    labelAr: 'إقامة',
    icon: '🏠',
  },
  {
    slug: 'sports-facilities',
    labelEn: 'Sports Facilities',
    labelAr: 'ملاعب رياضية',
    icon: '🏟️',
  },
  { slug: 'mobility', labelEn: 'Mobility', labelAr: 'تنقل', icon: '🚗' },
  {
    slug: 'beach-gear',
    labelEn: 'Beach Gear',
    labelAr: 'معدات الشاطئ',
    icon: '🏖️',
  },
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
