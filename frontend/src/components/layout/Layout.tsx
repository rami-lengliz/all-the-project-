import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CompareDrawer } from '@/components/shared/CompareDrawer';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <Header />
      <main>{children}</main>
      <Footer />
      <CompareDrawer />
    </div>
  );
}
