import React, { useEffect, useRef } from 'react';
import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotMessageBubble } from './ChatbotMessageBubble';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { detectLastActionableResult } from '../utils/chatbot-actionable-results';
import {
  getNextStepIntents,
  intentsToSuggestions,
} from '../utils/chatbot-suggestion-priorities';

interface ChatbotMessageListProps {
  messages: ChatbotMessage[];
  conversationId: string;
  isPending: boolean;
  typingText?: string;
  onSuggestionSelect?: (message: string) => void;
}

export function ChatbotMessageList({
  messages,
  conversationId,
  isPending,
  typingText,
  onSuggestionSelect,
}: ChatbotMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isPending]);

  // ── Structured actionable-result detection replaces naive backward-scan ──
  const actionableResult =
    !isPending && messages.length > 0
      ? detectLastActionableResult(messages)
      : null;

  const inlineNextSteps = actionableResult
    ? intentsToSuggestions(getNextStepIntents(actionableResult))
    : [];

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-4">
          <i className="fa-solid fa-robot text-blue-500 text-2xl" />
        </div>
        <h4 className="font-semibold text-slate-700 mb-2">How can I help you?</h4>
        <p className="text-sm">Ask about listings, bookings, or how to host.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="p-4 md:p-6 overflow-y-auto h-full scroll-smooth flex flex-col space-y-2"
    >
      {messages.map((msg) => (
        <ChatbotMessageBubble
          key={msg.id}
          message={msg}
          conversationId={conversationId}
        />
      ))}

      {isPending && (
        <div className="flex items-start mb-4 animate-in fade-in max-w-[85%]">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mr-3 flex-shrink-0 shadow-sm mt-1">
            <i className="fa-solid fa-robot text-white text-[12px]" />
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
            <div className="flex space-x-1.5 h-6 items-center w-8">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
            </div>
            {typingText && (
              <p className="text-xs text-slate-500 mt-2 italic">{typingText}</p>
            )}
          </div>
        </div>
      )}

      {inlineNextSteps.length > 0 && onSuggestionSelect && (
        <div className="pt-1 pb-2">
          <ChatbotSuggestions
            suggestions={inlineNextSteps}
            onSelect={onSuggestionSelect}
            disabled={isPending}
            label="What's next?"
          />
        </div>
      )}
    </div>
  );
}
