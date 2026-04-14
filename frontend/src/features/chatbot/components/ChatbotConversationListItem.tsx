import React from 'react';
import { Conversation } from '../types/chatbot.types';
import { ChatbotConversationLabel } from '../types/chatbot-continuity.types';
import { formatRelativeTime } from '../utils/chatbot-conversation-labels';

interface ChatbotConversationListItemProps {
  conversation: Conversation;
  label: ChatbotConversationLabel;
  isSelected: boolean;
  isResumable: boolean;
  hasPendingConfirmation: boolean;
  lastActiveAt: string;
  onClick: (id: string) => void;
}

export function ChatbotConversationListItem({
  conversation,
  label,
  isSelected,
  isResumable,
  hasPendingConfirmation,
  lastActiveAt,
  onClick,
}: ChatbotConversationListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(conversation.id)}
      aria-selected={isSelected}
      aria-label={`Conversation: ${label.text}`}
      className={[
        'w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 group',
        isSelected
          ? 'bg-blue-600 text-white shadow-sm'
          : 'hover:bg-slate-100 text-slate-700',
      ].join(' ')}
    >
      {/* Icon badge */}
      <div
        className={[
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold',
          hasPendingConfirmation
            ? isSelected ? 'bg-yellow-400 text-yellow-900' : 'bg-yellow-100 text-yellow-700'
            : isResumable
            ? isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
            : isSelected ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500',
        ].join(' ')}
      >
        {hasPendingConfirmation ? (
          <i className="fa-solid fa-clock-rotate-left text-[11px]" />
        ) : isResumable ? (
          <i className="fa-solid fa-rotate-right text-[11px]" />
        ) : (
          <i className="fa-solid fa-message text-[11px]" />
        )}
      </div>

      {/* Label + time */}
      <div className="flex-1 min-w-0">
        <p className={[
          'text-xs font-semibold truncate',
          isSelected ? 'text-white' : 'text-slate-800',
        ].join(' ')}>
          {label.text}
        </p>
        <p className={[
          'text-[10px] mt-0.5',
          isSelected ? 'text-blue-100' : 'text-slate-400',
        ].join(' ')}>
          {hasPendingConfirmation
            ? '⚡ Action pending'
            : isResumable
            ? `▸ Resumable · ${formatRelativeTime(lastActiveAt)}`
            : formatRelativeTime(lastActiveAt)}
        </p>
      </div>
    </button>
  );
}
