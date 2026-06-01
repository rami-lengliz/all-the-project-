import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CompareDrawer } from '@/components/shared/CompareDrawer';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      {/* Keyboard users can jump straight past the nav (WCAG 2.4.1). Hidden
          until focused, then anchored top-left over the header. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
      <CompareDrawer />
    </div>
  );
}
