import type { AIRecommendation } from '@/types/recommendation';

export const mockRecommendations: AIRecommendation[] = [
  // --- CRITICAL: Pause underperformers ---
  {
    id: 'rec-1',
    severity: 'critical',
    category: 'status',
    title: 'Pause Underperforming Ad Set',
    analysis:
      'Ad set "Interest - Budget Shoppers" in "Flash Sale - BOGO" has a ROAS of 0.45x over the past 7 days. CPA ($89.20) is 4.2x above account average ($21.24). This ad set has burned $1,420 with only 16 conversions.',
    recommendedAction:
      'Pause this ad set immediately and reallocate budget to top-performing ad sets.',
    impactEstimate: 'Expected savings: ~$95/day',
    action: {
      type: 'pause_entity',
      entityType: 'adset',
      entityId: 'adset-4-1',
      entityName: 'Interest - Budget Shoppers',
      payload: {
        newStatus: 'PAUSED',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
  },
  {
    id: 'rec-2',
    severity: 'critical',
    category: 'budget',
    title: 'Stop Budget Bleeding',
    analysis:
      'Campaign "Retargeting - Cart Abandoners" has spent $892 in the last 3 days but ROAS dropped from 2.8x to 0.92x. The audience pool is exhausted (frequency: 4.2) and ad fatigue has set in.',
    recommendedAction:
      'Decrease daily budget from $80 to $30 until new creatives are ready.',
    impactEstimate: 'Prevent ~$50/day waste, save ~$350/week',
    action: {
      type: 'decrease_budget',
      entityType: 'campaign',
      entityId: 'camp-5',
      entityName: 'Retargeting - Cart Abandoners',
      payload: {
        newBudget: 30,
        currentBudget: 80,
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },

  // --- WARNING: Declining performance ---
  {
    id: 'rec-3',
    severity: 'warning',
    category: 'creative',
    title: 'Creative Fatigue Detected',
    analysis:
      'Ad "Before/After - Results" in "Lookalike - Purchase 1%" has been running for 45 days. CTR dropped 38% (from 2.94% to 1.82%) and frequency hit 1.70. The creative is losing effectiveness.',
    recommendedAction:
      'Pause this ad and launch fresh creative variants with updated messaging.',
    impactEstimate: 'Could improve CTR by 30-50% with fresh creative',
    action: {
      type: 'pause_entity',
      entityType: 'ad',
      entityId: 'ad-1-2-2',
      entityName: 'Before/After - Results',
      payload: {
        newStatus: 'PAUSED',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'rec-4',
    severity: 'warning',
    category: 'bidStrategy',
    title: 'Switch to Cost Cap Bidding',
    analysis:
      'Campaign "Holiday Gift Guide - Traffic" is using Lowest Cost bidding but CPA variance is 65% day-over-day. The algorithm is spending aggressively during high-competition hours without protecting your target CPA.',
    recommendedAction:
      'Switch from Lowest Cost to Cost Cap with a $25 target to stabilize CPA.',
    impactEstimate: 'Stabilize CPA within ±15% of target, reduce waste by ~20%',
    action: {
      type: 'change_bid_strategy',
      entityType: 'campaign',
      entityId: 'camp-6',
      entityName: 'Holiday Gift Guide - Traffic',
      payload: {
        newBidStrategy: 'COST_CAP',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'rec-5',
    severity: 'warning',
    category: 'targeting',
    title: 'Audience Overlap Alert',
    analysis:
      'Ad sets "Broad - Women 25-45" and "Retargeting - Website Visitors" have a 42% audience overlap. They\'re competing against each other in the auction, driving up CPM by an estimated 18%.',
    recommendedAction:
      'Exclude retargeting audiences from the broad ad set to eliminate self-competition.',
    impactEstimate: 'Could reduce CPM by ~15-20% and improve delivery efficiency',
    action: {
      type: 'adjust_targeting',
      entityType: 'adset',
      entityId: 'adset-1-1',
      entityName: 'Broad - Women 25-45',
      payload: {
        targetEntityId: 'adset-1-3',
        targetEntityName: 'Retargeting - Website Visitors',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },

  // --- OPPORTUNITY: Scale winners ---
  {
    id: 'rec-6',
    severity: 'opportunity',
    category: 'budget',
    title: 'Scale Top Performer',
    analysis:
      'Ad set "Broad - Women 25-45" has maintained 4.24x ROAS over 14 days with consistent CPA ($12.20). It\'s spending well below the daily budget cap and there\'s room to scale without risking performance.',
    recommendedAction:
      'Increase daily budget from $120 to $180 (50% increase) to capture more conversions.',
    impactEstimate: 'Projected +26 conversions/week at similar ROAS',
    action: {
      type: 'increase_budget',
      entityType: 'adset',
      entityId: 'adset-1-1',
      entityName: 'Broad - Women 25-45',
      payload: {
        newBudget: 180,
        currentBudget: 120,
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
  },
  {
    id: 'rec-7',
    severity: 'opportunity',
    category: 'budget',
    title: 'Reallocate Budget to Winner',
    analysis:
      'Campaign "Summer Sale 2024 - Conversions" is outperforming all other campaigns with 3.98x ROAS. Meanwhile "Brand Awareness - New Collection" has low direct ROI (1.60x ROAS). Consider shifting $50/day from awareness to conversions.',
    recommendedAction:
      'Increase Summer Sale budget by $50/day and decrease Brand Awareness by $50/day.',
    impactEstimate: 'Expected additional revenue: ~$200/day at current ROAS',
    action: {
      type: 'reallocate_budget',
      entityType: 'campaign',
      entityId: 'camp-1',
      entityName: 'Summer Sale 2024 - Conversions',
      payload: {
        newBudget: 300,
        currentBudget: 250,
        targetEntityId: 'camp-2',
        targetEntityName: 'Brand Awareness - New Collection',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 'rec-8',
    severity: 'opportunity',
    category: 'creative',
    title: 'Duplicate Winning Creative',
    analysis:
      'Ad "Lifestyle Shot - Beach Glow" has the highest ROAS (4.69x) and lowest CPA ($10.05) across all active ads. It\'s only running in one ad set ("Broad - Women 25-45").',
    recommendedAction:
      'Duplicate this creative into the "Lookalike - Purchase 1%" ad set to test if it performs well with a different audience.',
    impactEstimate: 'If it performs at 75% of current ROAS, could add ~$180/day in revenue',
    action: {
      type: 'refresh_creative',
      entityType: 'ad',
      entityId: 'ad-1-1-1',
      entityName: 'Lifestyle Shot - Beach Glow',
      payload: {
        targetEntityId: 'adset-1-2',
        targetEntityName: 'Lookalike - Purchase 1%',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
  },
  {
    id: 'rec-9',
    severity: 'warning',
    category: 'budget',
    title: 'Diminishing Returns on Spend',
    analysis:
      'Campaign "Lead Gen - Newsletter Signup" spend increased 40% last week but leads only grew 12%. Marginal CPA is $18.50 vs. average CPA of $8.45. You\'re hitting diminishing returns.',
    recommendedAction:
      'Reduce daily budget from $100 to $70 to operate at peak efficiency point.',
    impactEstimate: 'Save ~$30/day while losing only ~4 leads (better marginal CPA)',
    action: {
      type: 'decrease_budget',
      entityType: 'campaign',
      entityId: 'camp-3',
      entityName: 'Lead Gen - Newsletter Signup',
      payload: {
        newBudget: 70,
        currentBudget: 100,
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
  },
  {
    id: 'rec-10',
    severity: 'critical',
    category: 'status',
    title: 'Quality Score Alert',
    analysis:
      'Ad "Brand Story Video - 30s" quality ranking dropped to "Below Average" while engagement ranking remains high. This mismatch suggests the landing page experience needs improvement, not the ad creative.',
    recommendedAction:
      'Pause this ad until landing page is optimized to prevent further quality score degradation.',
    impactEstimate: 'Preventing quality score drop could reduce CPM by 20-30%',
    action: {
      type: 'pause_entity',
      entityType: 'ad',
      entityId: 'ad-2-1-1',
      entityName: 'Brand Story Video - 30s',
      payload: {
        newStatus: 'PAUSED',
      },
    },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 min ago
  },
];
