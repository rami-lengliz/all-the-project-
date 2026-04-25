import React from 'react';
import { ChatbotAssistantModeState } from '../types/chatbot-assistant-modes.types';

interface ChatbotAssistantModeCardProps {
  modeState: ChatbotAssistantModeState;
  showWhenGeneral?: boolean;
  isTaskInProgress?: boolean;
}

/**
 * Lightweight framing for the active assistant mode.
 * Primarily shown when the assistant has prioritized a specialized mode (Discovery, Booking, Host).
 *
 * Sits at the top of the chat view to orient the user.
 */
export function ChatbotAssistantModeCard({
  modeState,
  showWhenGeneral = false,
  isTaskInProgress = false,
}: ChatbotAssistantModeCardProps) {
  const { mode, label, description, icon } = modeState;

  // Don't show general mode by default to keep UI clean
  if (mode === 'GENERAL_ASSISTANT' && !showWhenGeneral) return null;

  // Mode-specific styles
  const styles: Record<string, { bg: string; text: string; icon: string; border: string }> = {
    DISCOVERY_ASSISTANT: {
      bg: 'bg-blue-50/50',
      text: 'text-blue-700',
      icon: 'bg-blue-100 text-blue-600',
      border: 'border-blue-100/50',
    },
    BOOKING_ASSISTANT: {
      bg: 'bg-emerald-50/50',
      text: 'text-emerald-700',
      icon: 'bg-emerald-100 text-emerald-600',
      border: 'border-emerald-100/50',
    },
    HOST_ASSISTANT: {
      bg: 'bg-purple-50/50',
      text: 'text-purple-700',
      icon: 'bg-purple-100 text-purple-600',
      border: 'border-purple-100/50',
    },
    GENERAL_ASSISTANT: {
      bg: 'bg-slate-50/50',
      text: 'text-slate-600',
      icon: 'bg-slate-100 text-slate-500',
      border: 'border-slate-100/50',
    },
  };

  const style = styles[mode] ?? styles.GENERAL_ASSISTANT;

  return (
    <div
      role="status"
      aria-label={`${label}: ${description}`}
      className={`mx-4 mt-2 mb-1 rounded-lg border ${style.border} ${style.bg} flex items-center gap-2 transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
        isTaskInProgress ? 'py-1 px-3' : 'py-1.5 px-3'
      }`}
    >
      <div
        className={`${
          isTaskInProgress ? 'w-4 h-4' : 'w-5 h-5'
        } flex items-center justify-center rounded-md ${style.icon} shrink-0 relative`}
      >
        <i className={`fa-solid ${icon} ${isTaskInProgress ? 'text-[8px]' : 'text-[9px]'}`} />
        {!isTaskInProgress && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-white rounded-full flex items-center justify-center">
            <span className={`w-1 h-1 rounded-full ${style.icon.split(' ')[1]} animate-pulse`} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className={`${
            isTaskInProgress ? 'text-[9px]' : 'text-[10px]'
          } font-bold uppercase tracking-wider ${style.text}`}
        >
          {label}
        </h4>
        {!isTaskInProgress && (
          <p className="text-[9px] text-slate-500 truncate leading-tight">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-40">
        <div className={`w-1 h-1 rounded-full ${style.icon.split(' ')[1]}`} />
        {!isTaskInProgress && <div className="w-1 h-1 rounded-full bg-slate-300" />}
      </div>
    </div>
  );
}
