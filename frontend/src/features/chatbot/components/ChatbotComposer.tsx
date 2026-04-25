import React, { useState } from 'react';

export function ChatbotComposer({
  onSendMessage,
  isPending,
}: {
  onSendMessage: (msg: string) => void;
  isPending: boolean;
}) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    onSendMessage(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 md:p-4 bg-white border-t border-slate-200">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder="Type your message..."
          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition disabled:opacity-50 disabled:bg-slate-100"
        />
        <button 
          type="submit" 
          disabled={!text.trim() || isPending}
          className="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition disabled:opacity-50 shadow-sm"
        >
          <i className="fa-solid fa-paper-plane" />
        </button>
      </div>
    </form>
  );
}
