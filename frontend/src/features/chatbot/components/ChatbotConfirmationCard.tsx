import React, { useState } from 'react';
import { useConfirmChatbotAction } from '../hooks/useChatbot';
import { ChatbotBlockedState } from './ChatbotBlockedState';

export function ChatbotConfirmationCard({
  conversationId,
  token,
  actionName,
  summary,
  expiresAt,
  onDismiss
}: {
  conversationId: string;
  token: string;
  actionName: string;
  summary: string;
  expiresAt?: string;
  onDismiss?: () => void;
}) {
  const { mutateAsync: confirmAction, isPending } = useConfirmChatbotAction();
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

  const handleConfirm = async () => {
    try {
      setErrorStatus(null);
      await confirmAction({ conversationId, confirmationToken: token });
      setIsSuccess(true);
    } catch (e: any) {
      const status = e.response?.data?.status || 'execution_error';
      const reason = e.response?.data?.error || e.response?.data?.message || 'Confirmation failed.';
      if (reason.includes('INVALID_STATUS_consumed') || reason.includes('consumed')) {
         setIsSuccess(true); // If it was already consumed, just hide the prompt natively organically
      } else {
         setErrorStatus(status);
         setErrorReason(reason);
      }
    }
  };

  if (isSuccess) {
    return (
      <div className="p-4 rounded-xl border border-green-200 bg-green-50 max-w-sm my-2 text-green-700">
        <div className="flex items-center gap-2 mb-1">
          <i className="fa-solid fa-circle-check" />
          <h4 className="font-semibold text-sm">Action Completed</h4>
        </div>
        <p className="text-xs">This request has successfully been processed.</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-yellow-200 bg-yellow-50 shadow-sm max-w-sm my-2 text-slate-800">
      <div className="flex items-center gap-2 mb-2 text-yellow-700">
        <i className="fa-solid fa-shield-check" />
        <h4 className="font-semibold text-sm">Confirmation Required</h4>
      </div>
      
      <p className="text-sm font-medium mb-4">{summary || `Please confirm the execution of ${actionName}`}</p>
      
      {isExpired && (
        <div className="mb-4 text-xs text-red-500 flex items-center gap-1">
          <i className="fa-solid fa-clock" /> This confirmation has expired.
        </div>
      )}

      {errorStatus && (
        <ChatbotBlockedState status={errorStatus} reason={errorReason || undefined} />
      )}

      {!isExpired && !errorStatus && (
        <div className="flex gap-2 mt-4 text-sm font-semibold">
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-3 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {isPending ? 'Processing...' : 'Confirm'}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={isPending}
              className="flex-1 bg-white border border-yellow-300 hover:bg-yellow-100 text-yellow-800 py-2 px-3 rounded-lg transition disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
