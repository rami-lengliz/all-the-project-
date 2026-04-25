import React, { useState, useEffect, useMemo, useRef } from 'react';

import {
  useChatbotConversations,
  useChatbotMessages,
  useChatbotMultiMessages,
  useSendChatbotMessage,
} from '../hooks/useChatbot';
import { ChatbotMessageList } from './ChatbotMessageList';
import { ChatbotComposer } from './ChatbotComposer';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { ChatbotConversationList, ConversationDisplayData } from './ChatbotConversationList';
import { ChatbotResumeCard } from './ChatbotResumeCard';
import { ChatbotFlowCard } from './ChatbotFlowCard';
import { ChatbotFlowRecoveryCard } from './ChatbotFlowRecoveryCard';
import { ChatbotFlowOutcomeCard } from './ChatbotFlowOutcomeCard';
import {
  intentsToSuggestions,
} from '../utils/chatbot-suggestion-priorities';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import { detectResumeState, isHighPriorityResume } from '../utils/chatbot-resume-utils';
import { deriveConversationLabel } from '../utils/chatbot-conversation-labels';
import { detectFlowState } from '../utils/chatbot-flow-state';
import { detectFlowOutcome } from '../utils/chatbot-flow-outcomes';
import { detectAssistantMode } from '../utils/chatbot-assistant-modes';
import { getModeEntrySuggestions } from '../utils/chatbot-mode-priorities';
import { ChatbotAssistantModeCard } from './ChatbotAssistantModeCard';


interface ChatbotPanelProps {
  onClose?: () => void;
  pageContext?: ChatbotContextPayload | null;
}

type PanelView = 'chat' | 'conversations';

export function ChatbotPanel({ onClose, pageContext = null }: ChatbotPanelProps) {
  const { data: conversations = [], isPending: isConvsPending } =
    useChatbotConversations();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [view, setView] = useState<PanelView>('chat');

  // Auto-select the most recent conversation on first load
  useEffect(() => {
    if (conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  // ── Load messages for the active conversation ──────────────────────────
  const { data: messages = [], isFetching: isMessagesFetching } =
    useChatbotMessages(activeConversationId);

  // ── Load messages for the top-3 most recent conversations for resume detection ──
  // We cap at 3 to keep parallel requests minimal. Active conversation is
  // already loaded above — exclude it to avoid double-fetching.
  const sideConversationIds = useMemo(
    () =>
      conversations
        .slice(0, 4)
        .map((c) => c.id)
        .filter((id) => id !== activeConversationId)
        .slice(0, 3),
    [conversations, activeConversationId],
  );

  const sideMessages = useChatbotMultiMessages(sideConversationIds);

  const { mutateAsync: sendMessage, isPending: isSending, isError: isSendError } =
    useSendChatbotMessage();

  const handleSendMessage = async (text: string) => {
    try {
      // If the user is in conversations view, switch back to chat first
      setView('chat');
      const res = await sendMessage({
        message: text,
        conversationId: activeConversationId ?? undefined,
      });
      if (
        res.conversationId &&
        (!activeConversationId || activeConversationId !== res.conversationId)
      ) {
        setActiveConversationId(res.conversationId);
      }
    } catch (e) {
      console.error('ChatbotPanel: failed to send message', e);
    }
  };

  // ── Resume card visibility — only shown when the user has not yet
  //    sent a message since selecting this conversation. Once they send
  //    their first message (sessionBaseCount changes), the card disappears.
  const sessionBaseMessageCountRef = useRef<number>(0);

  // When (a) the conversations first load and we auto-select, or (b) the user
  // explicitly switches conversations, lock the baseline count.
  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setView('chat');
    // Reset base count; messages for the new conversation will load async,
    // so we set it to -1 as a sentinel — real count set once messages load.
    sessionBaseMessageCountRef.current = -1;
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setView('chat');
    sessionBaseMessageCountRef.current = 0;
  };

  // ── Resume state for the active conversation ────────────────────────────
  const activeResumeState = useMemo(
    () => detectResumeState(messages),
    [messages],
  );

  // ── Guided flow state for the active conversation ─────────────────────
  const activeFlowState = useMemo(
    () => detectFlowState(messages, pageContext),
    [messages, pageContext],
  );

  // ── Flow outcome state — derived from flow state + raw messages ────────
  // Used to decide which card family to render (flow / outcome / recovery).
  const activeOutcomeState = useMemo(
    () => detectFlowOutcome(activeFlowState, messages, pageContext),
    // activeFlowState is already memoised; adding messages as dep catches
    // new-message-arrives edge cases where flow state doesn't recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFlowState, messages.length, pageContext],
  );

  // ── Assistant Mode detection ───────────────────────────────────────────
  // Determines if the assistant is in a specialized mode (Discovery, Booking, etc.)
  // based on the culmination of all current signals.
  const activeModeState = useMemo(
    () => detectAssistantMode(messages, activeFlowState, activeOutcomeState, pageContext),
    [messages, activeFlowState, activeOutcomeState, pageContext],
  );

  // ── UI UI framing state ───────────────────────────────────────────────
  // A task is in progress if there's an active flow, a high-priority resume
  // waiting, or a terminal outcome card being shown.
  // This informs the "compactness" of the assistant mode framing.
  const isTaskInProgress = useMemo(() => (
    activeOutcomeState.completionStatus === 'active' ||
    activeOutcomeState.showOutcomeCard ||
    (
      messages.length > 0 &&
      messages.length === sessionBaseMessageCountRef.current &&
      isHighPriorityResume(activeResumeState)
    )
  ), [activeOutcomeState, activeResumeState, messages.length]);

  // Lock the session baseline once messages have loaded for a freshly selected
  // conversation (sentinel -1 → real count).
  useEffect(() => {
    if (sessionBaseMessageCountRef.current === -1 && !isMessagesFetching) {
      sessionBaseMessageCountRef.current = messages.length;
    }
  }, [messages.length, isMessagesFetching]);

  // Show the resume card ONLY when:
  //   1. The conversation has messages (not a blank new chat)
  //   2. The user hasn't sent a new message in this session yet
  //   3. The resume state is high-priority
  const showResumeCard =
    messages.length > 0 &&
    messages.length === sessionBaseMessageCountRef.current &&
    isHighPriorityResume(activeResumeState);

  // ── Build conversation list display items ────────────────────────────────
  // detectResumeState and deriveConversationLabel are called once per
  // conversation per memoization cycle, not on every render.
  const conversationListItems = useMemo<ConversationDisplayData[]>(() => {
    const msgMap = new Map<string, import('../types/chatbot.types').ChatbotMessage[]>();

    // Active conversation messages
    if (activeConversationId) msgMap.set(activeConversationId, messages);
    // Side conversation messages
    sideMessages.forEach(({ conversationId, messages: msgs }) => {
      if (conversationId) msgMap.set(conversationId, msgs);
    });

    return conversations.map((conv) => {
      const convMessages = msgMap.get(conv.id) ?? [];
      const label = deriveConversationLabel(conv, convMessages);
      const resumeState = detectResumeState(convMessages);
      return {
        conversation: conv,
        label,
        isResumable: resumeState.isResumable && resumeState.kind !== 'after_blocked',
        hasPendingConfirmation: resumeState.kind === 'pending_confirmation',
      };
    });
  }, [conversations, activeConversationId, messages, sideMessages]);

  // ── Entry suggestions ───────────────────────────────────────────────────
  // Prioritised based on active assistant mode and page context.
  const entrySuggestions = useMemo(
    () => intentsToSuggestions(getModeEntrySuggestions(activeModeState, pageContext)),
    [activeModeState, pageContext],
  );

  const isEmpty = !isConvsPending && messages.length === 0;
  const isLoading = isConvsPending && !activeConversationId;

  return (
    <div className="flex flex-col h-[600px] w-full bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between text-white shrink-0 shadow-sm z-10">
        <div className="flex items-center">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center mr-3 backdrop-blur-sm border border-white/10">
            <i className="fa-solid fa-robot" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-wide">RentEverything AI</h3>
            <p className="text-[10px] text-blue-100 font-medium tracking-wider uppercase">
              Online
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Toggle between chat and conversation list */}
          <button
            type="button"
            onClick={() => setView(view === 'chat' ? 'conversations' : 'chat')}
            aria-label={view === 'chat' ? 'Show conversations' : 'Back to chat'}
            title={view === 'chat' ? 'All conversations' : 'Back'}
            className="w-8 h-8 hover:bg-white/20 rounded-full flex items-center justify-center transition"
          >
            <i className={`fa-solid ${view === 'chat' ? 'fa-clock-rotate-left' : 'fa-arrow-left'} text-sm`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chatbot"
              className="w-8 h-8 hover:bg-white/20 rounded-full flex items-center justify-center transition"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      </div>

      {/* ── Conversation list view ───────────────────────────────────── */}
      {view === 'conversations' && (
        <div className="flex-1 overflow-y-auto bg-white">
          <ChatbotConversationList
            items={conversationListItems}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
        </div>
      )}

      {/* ── Chat view ───────────────────────────────────────────────── */}
      {view === 'chat' && (
        <>
          {/* Assistant mode framing banner */}
          {activeConversationId && !isLoading && (
            <ChatbotAssistantModeCard
              modeState={activeModeState}
              isTaskInProgress={isTaskInProgress}
            />
          )}

          {/* Resume card — shown when returning to a conversation */}
          {activeConversationId && showResumeCard && !isLoading && (
            <ChatbotResumeCard
              conversationId={activeConversationId}
              resumeState={activeResumeState}
              onSuggestionSelect={handleSendMessage}
              isPending={isSending}
            />
          )}

          {/* Flow card (active flow state) — hidden when:
               - resume card is visible (first open)
               - outer outcome has a terminal/interruption card */}
          {activeConversationId && !isLoading && !showResumeCard &&
            activeOutcomeState.completionStatus === 'active' && (
            <ChatbotFlowCard
              flowState={activeFlowState}
              isPending={isSending}
              onSuggestionSelect={handleSendMessage}
              pageContext={pageContext}
            />
          )}

          {/* Flow recovery card — only for RECOVERY_READY (empty search within
               active flow that doesn't qualify for an outcome card yet) */}
          {activeConversationId && !isLoading && !showResumeCard &&
            activeOutcomeState.kind === 'RECOVERY_READY' && (
            <ChatbotFlowRecoveryCard
              flowState={activeFlowState}
              isPending={isSending}
              onSuggestionSelect={handleSendMessage}
              pageContext={pageContext}
            />
          )}

          {/* Outcome card — handles completion, interruption, and expired confirmation.
               Live PENDING_CONFIRMATION is handled by ResumeCard above. */}
          {activeConversationId && !isLoading && !showResumeCard &&
            activeOutcomeState.showOutcomeCard && (
            <ChatbotFlowOutcomeCard
              outcome={activeOutcomeState}
              isPending={isSending}
              onSuggestionSelect={handleSendMessage}
              pageContext={pageContext}
            />
          )}

          {/* Message area */}
          <div className="flex-1 overflow-hidden relative bg-slate-50">
            {isLoading ? (
              <div className="flex flex-col justify-center items-center h-full gap-3 text-slate-400">
                <i className="fa-solid fa-spinner animate-spin text-2xl text-blue-500" />
                <p className="text-xs font-semibold uppercase tracking-widest">Loading</p>
              </div>
            ) : (
              <ChatbotMessageList
                messages={messages}
                conversationId={activeConversationId ?? ''}
                isPending={isSending || (isMessagesFetching && messages.length === 0)}
                typingText={isSending ? 'Assistant is thinking…' : undefined}
                onSuggestionSelect={handleSendMessage}
              />
            )}
          </div>

          {/* Entry suggestions (only on first open, no messages) */}
          {isEmpty && !isSending && entrySuggestions.length > 0 && (
            <ChatbotSuggestions
              suggestions={entrySuggestions}
              onSelect={handleSendMessage}
              disabled={isSending}
              label="Try asking"
            />
          )}

          {isSendError && (
            <div className="bg-red-50 p-3 flex items-start text-red-600 border-t border-red-100 text-xs">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 mr-2" />
              <p>Failed to send message. Please try again or check your connection.</p>
            </div>
          )}

          <ChatbotComposer onSendMessage={handleSendMessage} isPending={isSending} />
        </>
      )}
    </div>
  );
}
