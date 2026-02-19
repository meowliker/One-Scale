'use client';

import { useRef, useEffect, useState } from 'react';
import {
  MessageSquare,
  Lightbulb,
  ClipboardList,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIChatStore } from '@/stores/aiChatStore';
import { ChatMessage } from '@/components/ai/ChatMessage';
import { ChatInput } from '@/components/ai/ChatInput';
import { AIRecommendationsList } from '@/components/ai/AIRecommendationsList';
import { AIDailyAudit } from '@/components/ai/AIDailyAudit';
import { AIInsightCard } from '@/components/ai/AIInsightCard';

type Tab = 'chat' | 'recommendations' | 'audit' | 'insights';

const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { id: 'audit', label: 'Daily Audit', icon: ClipboardList },
  { id: 'insights', label: 'Insights', icon: Sparkles },
];

export function AIChatClient() {
  const { messages, isTyping, sendMessage, insights } = useAIChatStore();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (activeTab === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, activeTab]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors cursor-pointer',
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'chat' && (
          <>
            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isTyping && (
                <div className="flex items-center gap-2 text-sm text-gray-400 ml-11 mb-4">
                  <span className="flex gap-1">
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </span>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <ChatInput onSend={sendMessage} isTyping={isTyping} />
            </div>
          </>
        )}

        {activeTab === 'recommendations' && (
          <div className="flex-1 overflow-y-auto p-4">
            <AIRecommendationsList />
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="flex-1 overflow-y-auto p-4">
            <AIDailyAudit />
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Account Insights</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  AI-detected trends and patterns in your ad account
                </p>
              </div>
              <div className="space-y-3">
                {insights.map((insight) => (
                  <AIInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
