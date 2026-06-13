import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { toast } from '@/components/ui/Toaster';

export type CategorySlug =
  | 'stays'
  | 'sports-facilities'
  | 'mobility'
  | 'beach-gear';

type CategoryItem = {
  slug: string;
  labelEn: string;
  labelFr: string;
  labelAr: string;
  icon: string;
  // UI-only placeholders: not backed by listings yet, shown with a "Soon" badge.
  placeholder?: boolean;
};

const CATEGORIES: CategoryItem[] = [
  {
    slug: 'stays',
    labelEn: 'Stays',
    labelFr: 'Logements',
    labelAr: 'إقامة',
    icon: '🏠',
  },
  {
    slug: 'sports-facilities',
    labelEn: 'Sports Facilities',
    labelFr: 'Terrains de sport',
    labelAr: 'ملاعب رياضية',
    icon: '🏟️',
  },
  {
    slug: 'mobility',
    labelEn: 'Mobility',
    labelFr: 'Mobilité',
    labelAr: 'تنقل',
    icon: '🚗',
  },
  {
    slug: 'beach-gear',
    labelEn: 'Beach Gear',
    labelFr: 'Équipement de plage',
    labelAr: 'معدات الشاطئ',
    icon: '🏖️',
  },
  {
    slug: 'tools-equipment',
    labelEn: 'Tools & Equipment',
    labelFr: 'Outils & Matériel',
    labelAr: 'أدوات ومعدات',
    icon: '🔧',
    placeholder: true,
  },
  {
    slug: 'events-party',
    labelEn: 'Events & Party',
    labelFr: 'Événements & Fêtes',
    labelAr: 'مناسبات وحفلات',
    icon: '🎉',
    placeholder: true,
  },
  {
    slug: 'electronics',
    labelEn: 'Electronics',
    labelFr: 'Électronique',
    labelAr: 'إلكترونيات',
    icon: '📷',
    placeholder: true,
  },
  {
    slug: 'fashion',
    labelEn: 'Fashion',
    labelFr: 'Mode',
    labelAr: 'أزياء',
    icon: '👗',
    placeholder: true,
  },
];

const chipClass =
  'flex shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';

export function CategoryStrip() {
  const { lang } = useLanguage();

  const label = (c: CategoryItem) =>
    lang === 'ar' ? c.labelAr : lang === 'fr' ? c.labelFr : c.labelEn;

  const soonText =
    lang === 'ar' ? 'قريباً' : lang === 'fr' ? 'Bientôt' : 'Soon';

  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {CATEGORIES.map((c) =>
        c.placeholder ? (
          <button
            key={c.slug}
            type="button"
            onClick={() =>
              toast({
                variant: 'info',
                title:
                  lang === 'ar'
                    ? `${label(c)} — قريباً على RentAI`
                    : lang === 'fr'
                      ? `${label(c)} — bientôt sur RentAI`
                      : `${label(c)} — coming soon to RentAI`,
              })
            }
            className={`${chipClass} text-slate-500`}
          >
            <span aria-hidden>{c.icon}</span>
            <span>{label(c)}</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {soonText}
            </span>
          </button>
        ) : (
          <Link
            key={c.slug}
            href={{ pathname: '/search', query: { categorySlug: c.slug } }}
            className={chipClass}
          >
            <span aria-hidden>{c.icon}</span>
            <span>{label(c)}</span>
          </Link>
        ),
      )}
    </div>
  );
}
