import type { AIRecommendation, AIDailyAudit, AIInsight } from '@/types/ai';
import {
  mockChatResponses,
  mockRecommendations,
  mockDailyAudit,
  mockInsights,
} from '@/data/mockAIResponses';
import { todayInTimezone } from '@/lib/timezone';

const USE_MOCK = true;

/**
 * Matches user input against keyword-based response templates.
 * Falls back to a generic response when no keywords match.
 */
export async function getChatResponse(message: string): Promise<string> {
  if (USE_MOCK) {
    // Simulate network latency (1–2 s)
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const lower = message.toLowerCase();

    // Ordered keyword lookup — first match wins
    const keywordPairs: [string[], string][] = [
      [['roas drop', 'roas fell', 'roas decreased', 'why did roas'], 'roas drop'],
      [['creative', 'creatives', 'what ad', 'which ad', 'test ad'], 'creative'],
      [['budget', 'allocat', 'reallocat', 'how much to spend'], 'budget'],
      [['scale', 'scaling', 'grow', 'increase spend'], 'scale'],
      [['yesterday', 'today', 'daily', 'what happened', 'morning', 'audit', 'briefing'], 'yesterday'],
      [['fatigue', 'fatigued', 'stale', 'worn out', 'creative fatigue'], 'fatigue'],
      [['audience', 'targeting', 'who should', 'lookalike', 'retarget'], 'audience'],
      [['competitor', 'competition', 'market', 'industry'], 'competitor'],
      [['help', 'what can you', 'how to use', 'commands'], 'help'],
      [['priorit', 'top 3', 'focus', 'what should i do'], 'priorities'],
      [['cpa', 'cost per', 'acquisition cost'], 'cpa'],
    ];

    for (const [keywords, key] of keywordPairs) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return mockChatResponses[key];
      }
    }

    return mockChatResponses['default'];
  }

  return '';
}

export async function getRecommendations(): Promise<AIRecommendation[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockRecommendations;
  }

  return [];
}

export async function getDailyAudit(): Promise<AIDailyAudit> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockDailyAudit;
  }

  return {
    date: todayInTimezone(),
    totalSpend: 0,
    totalRevenue: 0,
    overallROAS: 0,
    keyChanges: [],
    topRecommendations: [],
    insights: [],
  };
}

export async function getInsights(): Promise<AIInsight[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockInsights;
  }

  return [];
}
