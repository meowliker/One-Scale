'use client';

import { useRef, useEffect } from 'react';
import { X, Bot, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIChatStore } from '@/stores/aiChatStore';
import { ChatMessage } from '@/components/ai/ChatMessage';
import { ChatInput } from '@/components/ai/ChatInput';
import Link from 'next/link';

export function AIChatSidebar() {
  const { messages, isTyping, isSidebarOpen, toggleSidebar, sendMessage } =
    useAIChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <>
      {/* Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={toggleSidebar}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-[400px] max-w-[90vw] bg-white shadow-2xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">AI Media Buyer</h3>
              <p className="text-[10px] text-gray-500">Quick chat</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/ai-assistant"
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              title="Open full page"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={{ height: 'calc(100% - 160px)' }}>
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isTyping && (
            <div className="flex items-center gap-2 text-sm text-gray-400 ml-11">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
          <ChatInput onSend={sendMessage} isTyping={isTyping} />
        </div>
      </div>
    </>
  );
}
