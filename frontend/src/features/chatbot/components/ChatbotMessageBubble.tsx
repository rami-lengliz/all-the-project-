import React from 'react';
import { ChatbotMessage, GovernedToolResult } from '../types/chatbot.types';
import { ChatbotToolResultRenderer } from './ChatbotToolResultRenderer';
import { ChatbotConfirmationCard } from './ChatbotConfirmationCard';
import { ChatbotBlockedState } from './ChatbotBlockedState';

export function ChatbotMessageBubble({
  message,
  conversationId,
}: {
  message: ChatbotMessage;
  conversationId: string;
}) {
  const isUser = message.role === 'user';
  
  if (isUser) {
    return (
      <div className="flex items-start justify-end mb-4">
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-3 shadow-sm max-w-[85%]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  const hasContent = !!message.content && message.role !== 'tool';
  // Parse tool results from metadata if mapped explicitly from backend
  const result: GovernedToolResult | undefined = message.metadata?.toolResult;
  const toolName = message.metadata?.toolName;

  return (
    <div className="flex items-start mb-4">
      <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mr-3 flex-shrink-0 shadow-sm mt-1">
        <i className="fa-solid fa-robot text-white text-[12px]" />
      </div>
      
      <div className="flex flex-col gap-2 max-w-[85%] w-full">
        {hasContent && (
          <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        )}
        
        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
             {result.status === 'success' && toolName && (
                <ChatbotToolResultRenderer toolName={toolName} result={result} />
             )}

             {result.status === 'confirmation_required' && result.output?.confirmationToken && (
                <ChatbotConfirmationCard 
                  conversationId={conversationId} 
                  token={result.output.confirmationToken} 
                  actionName={toolName || 'action'} 
                  summary={result.output.summary || result.output.message}
                  expiresAt={result.output.expiresAt}
                />
             )}

             {['rate_limited', 'trust_restricted', 'suspicious_activity', 'cooldown_active', 'policy_blocked'].includes(result.status) && (
                <ChatbotBlockedState status={result.status} reason={result.errorMessage || result.output?.message || result.output?.error} />
             )}
          </div>
        )}
      </div>
    </div>
  );
}
