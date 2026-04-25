import React from 'react';
import { ChatbotSuggestion } from '../types/chatbot-suggestions.types';

const variantStyles: Record<NonNullable<ChatbotSuggestion['variant']>, string> = {
  default: 'bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50',
  action:  'bg-blue-600 border border-blue-600 text-white hover:bg-blue-700',
  info:    'bg-slate-50 border border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-100',
  warning: 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100',
};

interface ChatbotSuggestionsProps {
  suggestions: ChatbotSuggestion[];
  onSelect: (message: string) => void;
  disabled?: boolean;
  label?: string;
}

export function ChatbotSuggestions({
  suggestions,
  onSelect,
  disabled = false,
  label,
}: ChatbotSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="px-4 pb-3 pt-1 shrink-0">
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(s.message)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              'transition-all duration-150 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed',
              variantStyles[s.variant ?? 'default'],
            ].join(' ')}
          >
            {s.icon && <i className={`fa-solid ${s.icon} text-[10px]`} />}
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
