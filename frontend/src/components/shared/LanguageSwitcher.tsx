import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { LANGS } from '@/lib/i18n/translations';

/**
 * Globe language switcher (EN / FR / AR). Persists the choice and flips the
 * page to right-to-left for Arabic. Self-contained — no routing changes.
 */
export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Language"
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
          open
            ? 'border-cyan-400 bg-cyan-50 text-cyan-600'
            : 'border-cyan-300 text-cyan-600 hover:border-cyan-400 hover:bg-cyan-50'
        }`}
      >
        <i className="fa-solid fa-globe text-base" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Language
          </p>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={lang === l.code}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-sm transition hover:bg-slate-50 ${
                lang === l.code ? 'font-semibold text-cyan-700' : 'text-slate-700'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-base leading-none">{l.flag}</span>
                {l.label}
              </span>
              {lang === l.code && (
                <i className="fa-solid fa-check text-xs text-cyan-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
