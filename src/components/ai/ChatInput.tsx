'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AISuggestedPrompts } from '@/components/ai/AISuggestedPrompts';

interface ChatInputProps {
  onSend: (message: string) => void;
  isTyping: boolean;
}

export function ChatInput({ onSend, isTyping }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isTyping) return;
    onSend(trimmed);
    setValue('');
    inputRef.current?.focus();
  }, [value, isTyping, onSend]);

  const handlePromptSelect = useCallback(
    (prompt: string) => {
      if (isTyping) return;
      onSend(prompt);
    },
    [isTyping, onSend]
  );

  return (
    <div className="space-y-3">
      {/* Typing indicator */}
      {isTyping && (
        <div className="flex items-center gap-2 text-sm text-gray-500 px-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Thinking...</span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Ask your AI media buyer anything..."
          disabled={isTyping}
          className={cn(
            'flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm',
            'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || isTyping}
          className={cn(
            'p-2.5 rounded-xl transition-colors',
            value.trim() && !isTyping
              ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Suggested prompts */}
      <AISuggestedPrompts onSelect={handlePromptSelect} />
    </div>
  );
}
