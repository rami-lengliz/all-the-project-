import React from 'react';
import { Conversation } from '../types/chatbot.types';
import { ChatbotConversationListItem } from './ChatbotConversationListItem';
import { ChatbotConversationLabel } from '../types/chatbot-continuity.types';

/**
 * Pre-computed per-conversation display data.
 * Derived upstream (in ChatbotPanel) so this component stays presentation-only
 * and avoids running detectResumeState on every render.
 */
export interface ConversationDisplayData {
  conversation: Conversation;
  label: ChatbotConversationLabel;
  isResumable: boolean;
  hasPendingConfirmation: boolean;
}

interface ChatbotConversationListProps {
  items: ConversationDisplayData[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}

export function ChatbotConversationList({
  items,
  activeConversationId,
  onSelect,
  onNewConversation,
}: ChatbotConversationListProps) {
  if (items.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
          <i className="fa-solid fa-comments text-slate-400" />
        </div>
        <p className="text-xs text-slate-500">No conversations yet.</p>
        <button
          type="button"
          onClick={onNewConversation}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          Start one
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* New conversation CTA */}
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onNewConversation}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition text-xs font-semibold"
        >
          <i className="fa-solid fa-plus" />
          New conversation
        </button>
      </div>

      <div className="px-3 pb-3 space-y-1 overflow-y-auto max-h-[220px]">
        {items.map(({ conversation, label, isResumable, hasPendingConfirmation }) => (
          <ChatbotConversationListItem
            key={conversation.id}
            conversation={conversation}
            label={label}
            isSelected={conversation.id === activeConversationId}
            isResumable={isResumable}
            hasPendingConfirmation={hasPendingConfirmation}
            lastActiveAt={conversation.updatedAt}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
