import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { translations, RTL_LANGS, type Lang } from './translations';

const STORAGE_KEY = 'rentai:lang';

interface LanguageContextValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  /** Translate a key for the active language; falls back to English, then to `fallback`, then the key. */
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'fr' || v === 'ar';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start at 'en' on the server and the first client render to avoid a
  // hydration mismatch; the saved preference is applied right after mount.
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLang(saved)) setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const dir: 'ltr' | 'rtl' = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) =>
      translations[lang]?.[key] ?? translations.en[key] ?? fallback ?? key,
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider.
    return {
      lang: 'en',
      dir: 'ltr',
      setLang: () => {},
      t: (key: string, fallback?: string) => fallback ?? key,
    };
  }
  return ctx;
}

/** Convenience hook when you only need the translate function. */
export function useT(): (key: string, fallback?: string) => string {
  return useLanguage().t;
}
