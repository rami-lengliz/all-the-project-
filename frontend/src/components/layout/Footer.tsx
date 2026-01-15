import Link from 'next/link';
import { useRouter } from 'next/router';

export function Footer() {
  const { locale } = useRouter();
  return (
    <footer className="mt-16 bg-slate-900 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
        <div>
          <h4 className="mb-4 font-semibold">{locale === 'ar' ? 'حول' : 'About'}</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <Link href="/help" className="hover:text-white">
                {locale === 'ar' ? 'كيف يعمل' : 'How it works'}
              </Link>
            </li>
            <li>
              <Link href="/help" className="hover:text-white">
                {locale === 'ar' ? 'عنّا' : 'About us'}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 font-semibold">{locale === 'ar' ? 'الدعم' : 'Support'}</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <Link href="/help" className="hover:text-white">
                {locale === 'ar' ? 'مركز المساعدة' : 'Help Center'}
              </Link>
            </li>
            <li>
              <Link href="/help" className="hover:text-white">
                {locale === 'ar' ? 'تواصل معنا' : 'Contact us'}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 font-semibold">{locale === 'ar' ? 'الاستضافة' : 'Hosting'}</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <Link href="/host/create" className="hover:text-white">
                {locale === 'ar' ? 'كن مضيفاً' : 'Become a host'}
              </Link>
            </li>
            <li>
              <Link href="/host/dashboard" className="hover:text-white">
                {locale === 'ar' ? 'لوحة المضيف' : 'Host dashboard'}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 font-semibold">{locale === 'ar' ? 'قانوني' : 'Legal'}</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <a className="hover:text-white" href="#">
                {locale === 'ar' ? 'الشروط' : 'Terms'}
              </a>
            </li>
            <li>
              <a className="hover:text-white" href="#">
                {locale === 'ar' ? 'الخصوصية' : 'Privacy'}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} RentEverything</span>
          <span>{locale === 'ar' ? 'تونس' : 'Tunisia'}</span>
        </div>
      </div>
    </footer>
  );
}

