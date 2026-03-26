'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Zap, Pencil, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { InboxCreative, CreativeBatch, LaunchConfig } from '@/types/creativeHub';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: Partial<LaunchConfig> & { batches?: CreativeBatch[]; summary?: string };
}

function parseLocalPlan(
  message: string,
  creativeCount: number
): { batches: CreativeBatch[]; summary: string; size: number; budget: number; days: number } {
  const sizeMatch = message.match(/(\d+)\s*per\s*(?:ad\s*)?set/i);
  const budgetMatch = message.match(/\$(\d+)/);
  const daysMatch = message.match(/(\d+)\s*days?/i);
  const allMatch = message.match(/(?:test\s+)?all\s+(\d+)/i);
  const countMatch = message.match(/(?:test|launch)\s+(\d+)\s+creative/i);

  const size = sizeMatch ? parseInt(sizeMatch[1]) : 3;
  const budget = budgetMatch ? parseInt(budgetMatch[1]) : 20;
  const days = daysMatch ? parseInt(daysMatch[1]) : 3;
  const testCount = allMatch
    ? parseInt(allMatch[1])
    : countMatch
      ? parseInt(countMatch[1])
      : creativeCount;

  const actualCount = Math.min(testCount, creativeCount);
  const batchCount = Math.ceil(actualCount / size);
  const totalDaily = budget * batchCount;

  return {
    batches: [],
    summary: `${batchCount} ad sets x ${size} ads = ${actualCount} total\nBudget: $${totalDaily}/day for ${days} days = $${totalDaily * days} total`,
    size,
    budget,
    days,
  };
}

function generateResponse(message: string, creativeCount: number): ChatMessage {
  const lower = message.toLowerCase();
  const hasLaunchIntent =
    lower.includes('test') || lower.includes('launch') || lower.includes('run') || lower.includes('create');
  const hasNumbers = /\d/.test(message);

  if (hasLaunchIntent && hasNumbers) {
    const plan = parseLocalPlan(message, creativeCount);
    const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Here's the launch plan:\n\nCampaign: CBO | Creative Test | ${today}\n${plan.summary}`,
      plan: {
        batches: plan.batches,
        dailyBudget: plan.budget,
        testDuration: plan.days,
        creativesPerBatch: plan.size,
        summary: plan.summary,
      },
    };
  }

  if (hasLaunchIntent) {
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `I can help you set up a launch. Try something like:\n\n"Test all ${creativeCount} creatives, 3 per ad set, $20/set, 3 days"\n\nOr specify how many creatives, budget, and test duration.`,
    };
  }

  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: `I can help you plan and launch creative tests. Tell me what you'd like to do, for example:\n\n- "Test all ${creativeCount} creatives, 3 per set, $20 budget, 3 days"\n- "Launch top 10 creatives with $50 per ad set"\n- "Run a fair test, 1 creative per ad set, $30 budget"`,
  };
}

interface ChatLaunchTabProps {
  creatives: InboxCreative[];
  onSwitchToGrid?: () => void;
}

export function ChatLaunchTab({ creatives, onSwitchToGrid }: ChatLaunchTabProps) {
  const { autoBatch, updateLaunchConfig, setLaunchCenterTab, executeLaunch, launchConfig } =
    useCreativeHubStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Welcome to Chat Launch! You have ${creatives.length} creatives ready.\n\nDescribe how you'd like to test them and I'll create a plan. For example:\n"Test all ${creatives.length} creatives, 3 per set, $20/set, 3 days"`,
    },
  ]);
  const [input, setInput] = useState('');
  const [launching, setLaunching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: trimmed,
    };

    const response = generateResponse(trimmed, creatives.length);

    setMessages((prev) => [...prev, userMsg, response]);
    setInput('');
    inputRef.current?.focus();
  }, [input, creatives.length]);

  const handleEditPlan = useCallback(
    (plan: ChatMessage['plan']) => {
      if (!plan) return;
      const size = plan.creativesPerBatch ?? 3;
      autoBatch('sequential', size);
      if (plan.dailyBudget) updateLaunchConfig({ dailyBudget: plan.dailyBudget });
      if (plan.testDuration) updateLaunchConfig({ testDuration: plan.testDuration });
      setLaunchCenterTab('grid');
      onSwitchToGrid?.();
    },
    [autoBatch, updateLaunchConfig, setLaunchCenterTab, onSwitchToGrid]
  );

  const handleLaunchNow = useCallback(
    async (plan: ChatMessage['plan']) => {
      if (!plan) return;
      setLaunching(true);
      try {
        const size = plan.creativesPerBatch ?? 3;
        autoBatch('sequential', size);
        if (plan.dailyBudget) updateLaunchConfig({ dailyBudget: plan.dailyBudget });
        if (plan.testDuration) updateLaunchConfig({ testDuration: plan.testDuration });
        // The actual launch will be triggered by the parent component
        // For now, show confirmation
        const confirmMsg: ChatMessage = {
          id: `msg-${Date.now()}-confirm`,
          role: 'assistant',
          content: 'Plan loaded into batches. Switch to the Grid tab to review and launch, or use the main Launch button.',
        };
        setMessages((prev) => [...prev, confirmMsg]);
      } finally {
        setLaunching(false);
      }
    },
    [autoBatch, updateLaunchConfig]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600/10 flex items-center justify-center mt-0.5">
                <Bot className="w-4 h-4 text-blue-500" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-xl px-4 py-3 text-sm',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
              )}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.plan && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200/30 dark:border-gray-700/50">
                  <button
                    onClick={() => handleEditPlan(msg.plan)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit Plan
                  </button>
                  <button
                    onClick={() => handleLaunchNow(msg.plan)}
                    disabled={launching}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3" />
                    {launching ? 'Loading...' : 'Launch Now'}
                  </button>
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center mt-0.5">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your launch instructions..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 max-h-24"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              'flex-shrink-0 p-2.5 rounded-xl transition-colors',
              input.trim()
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
