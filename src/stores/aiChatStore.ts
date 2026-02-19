import { create } from 'zustand';
import type { ChatMessage, AIRecommendation, AIInsight } from '@/types/ai';
import { getChatResponse } from '@/services/ai';
import {
  mockRecommendations,
  mockInsights,
} from '@/data/mockAIResponses';

interface AIChatState {
  messages: ChatMessage[];
  recommendations: AIRecommendation[];
  insights: AIInsight[];
  isTyping: boolean;
  isSidebarOpen: boolean;
  sendMessage: (content: string) => void;
  applyRecommendation: (id: string) => void;
  dismissRecommendation: (id: string) => void;
  toggleSidebar: () => void;
}

export const useAIChatStore = create<AIChatState>()((set, get) => ({
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Good morning! I\'m your AI media buyer assistant. I\'ve already analyzed your account overnight. Your ROAS improved to 3.33x yesterday — nice. But there are a few things we need to address. Ask me anything or check out the recommendations tab.',
      timestamp: new Date().toISOString(),
    },
  ],
  recommendations: mockRecommendations,
  insights: mockInsights,
  isTyping: false,
  isSidebarOpen: false,

  sendMessage: (content: string) => {
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }));

    // Fetch AI response asynchronously
    getChatResponse(content).then((response) => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isTyping: false,
      }));
    });
  },

  applyRecommendation: (id: string) => {
    set((state) => ({
      recommendations: state.recommendations.map((rec) =>
        rec.id === id ? { ...rec, isApplied: true } : rec
      ),
    }));
  },

  dismissRecommendation: (id: string) => {
    set((state) => ({
      recommendations: state.recommendations.filter((rec) => rec.id !== id),
    }));
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },
}));
