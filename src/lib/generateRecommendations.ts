import type { Campaign, AdSet, Ad } from '@/types/campaign';
import type {
  AIRecommendation,
  RecommendationSeverity,
  RecommendationCategory,
  RecommendationAction,
} from '@/types/recommendation';
import type { HourlyPnLEntry } from '@/types/pnl';

// ---- helpers ----

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `rec-gen-${idCounter}`;
}

function resetIdCounter(): void {
  idCounter = 0;
}

function fmt$(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtX(n: number): string {
  return `${n.toFixed(2)}x`;
}

function makeRec(
  severity: RecommendationSeverity,
  category: RecommendationCategory,
  title: string,
  analysis: string,
  recommendedAction: string,
  impactEstimate: string,
  action: RecommendationAction,
  minutesAgo: number
): AIRecommendation {
  return {
    id: nextId(),
    severity,
    category,
    title,
    analysis,
    recommendedAction,
    impactEstimate,
    action,
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * minutesAgo).toISOString(),
  };
}

// Collect all active ads across all campaigns with parent references
interface AdWithContext {
  ad: Ad;
  adSet: AdSet;
  campaign: Campaign;
}

function collectActiveAds(campaigns: Campaign[]): AdWithContext[] {
  const results: AdWithContext[] = [];
  for (const campaign of campaigns) {
    for (const adSet of campaign.adSets) {
      for (const ad of adSet.ads) {
        if (ad.status === 'ACTIVE') {
          results.push({ ad, adSet, campaign });
        }
      }
    }
  }
  return results;
}

function collectActiveAdSets(campaigns: Campaign[]): { adSet: AdSet; campaign: Campaign }[] {
  const results: { adSet: AdSet; campaign: Campaign }[] = [];
  for (const campaign of campaigns) {
    for (const adSet of campaign.adSets) {
      if (adSet.status === 'ACTIVE') {
        results.push({ adSet, campaign });
      }
    }
  }
  return results;
}

// ---- recommendation generators ----

/**
 * Critical - Pause underperforming ad sets: ROAS < 1.0 AND spend > $200
 */
function checkUnderperformingAdSets(
  campaigns: Campaign[]
): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAdSets = collectActiveAdSets(campaigns);

  for (const { adSet, campaign } of activeAdSets) {
    const { roas, spend, cpa, conversions } = adSet.metrics;
    if (roas < 1.0 && spend > 200) {
      recs.push(
        makeRec(
          'critical',
          'status',
          'Pause Underperforming Ad Set',
          `Ad set "${adSet.name}" in "${campaign.name}" has a ROAS of ${fmtX(roas)} with ${fmt$(spend)} in spend and only ${conversions} conversions (CPA: ${fmt$(cpa)}). This ad set is losing money.`,
          'Pause this ad set immediately and reallocate budget to top-performing ad sets.',
          `Expected savings: ~${fmt$(adSet.dailyBudget)}/day`,
          {
            type: 'pause_entity',
            entityType: 'adset',
            entityId: adSet.id,
            entityName: adSet.name,
            payload: { newStatus: 'PAUSED' },
          },
          30
        )
      );
    }
  }
  return recs;
}

/**
 * Critical - Pause ads with CPA > 3x average CPA of active ads in same campaign
 */
function checkHighCPAAds(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    // Collect all active ads in this campaign
    const activeAds: AdWithContext[] = [];
    for (const adSet of campaign.adSets) {
      for (const ad of adSet.ads) {
        if (ad.status === 'ACTIVE' && ad.metrics.conversions > 0) {
          activeAds.push({ ad, adSet, campaign });
        }
      }
    }

    if (activeAds.length < 2) continue;

    const totalCPA =
      activeAds.reduce((sum, { ad }) => sum + ad.metrics.cpa, 0) / activeAds.length;

    for (const { ad, adSet } of activeAds) {
      if (ad.metrics.cpa > totalCPA * 3) {
        recs.push(
          makeRec(
            'critical',
            'status',
            'Pause High-CPA Ad',
            `Ad "${ad.name}" in ad set "${adSet.name}" has a CPA of ${fmt$(ad.metrics.cpa)}, which is ${(ad.metrics.cpa / totalCPA).toFixed(1)}x the campaign average CPA of ${fmt$(totalCPA)}. It has spent ${fmt$(ad.metrics.spend)} with only ${ad.metrics.conversions} conversions.`,
            'Pause this ad immediately to stop budget drain.',
            `Expected savings: ~${fmt$(ad.metrics.spend / 7)}/day`,
            {
              type: 'pause_entity',
              entityType: 'ad',
              entityId: ad.id,
              entityName: ad.name,
              payload: { newStatus: 'PAUSED' },
            },
            25
          )
        );
      }
    }
  }
  return recs;
}

/**
 * Critical - Quality Score Alert: qualityRanking >= 3 (below average)
 */
function checkQualityScore(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAds = collectActiveAds(campaigns);

  for (const { ad, adSet } of activeAds) {
    if (ad.metrics.qualityRanking >= 3) {
      const engagementLabel =
        ad.metrics.engagementRateRanking <= 1
          ? 'above average'
          : ad.metrics.engagementRateRanking <= 2
          ? 'average'
          : 'below average';
      recs.push(
        makeRec(
          'critical',
          'status',
          'Quality Score Alert',
          `Ad "${ad.name}" in "${adSet.name}" has a quality ranking of "Below Average" while engagement ranking is "${engagementLabel}". This mismatch suggests the landing page experience needs improvement, not the ad creative.`,
          'Pause this ad until landing page is optimized to prevent further quality score degradation.',
          'Preventing quality score drop could reduce CPM by 20-30%',
          {
            type: 'pause_entity',
            entityType: 'ad',
            entityId: ad.id,
            entityName: ad.name,
            payload: { newStatus: 'PAUSED' },
          },
          15
        )
      );
    }
  }
  return recs;
}

/**
 * Warning - Creative Fatigue: frequency > 1.8 AND CTR < 1.5%
 */
function checkCreativeFatigue(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAds = collectActiveAds(campaigns);

  for (const { ad, adSet } of activeAds) {
    const { frequency, ctr } = ad.metrics;
    if (frequency > 1.8 && ctr < 1.5) {
      recs.push(
        makeRec(
          'warning',
          'creative',
          'Creative Fatigue Detected',
          `Ad "${ad.name}" in "${adSet.name}" has a frequency of ${frequency.toFixed(2)} and CTR has dropped to ${fmtPct(ctr)}. The creative is losing effectiveness as the audience sees it repeatedly.`,
          'Pause this ad and launch fresh creative variants with updated messaging.',
          'Could improve CTR by 30-50% with fresh creative',
          {
            type: 'refresh_creative',
            entityType: 'ad',
            entityId: ad.id,
            entityName: ad.name,
            payload: { newStatus: 'PAUSED' },
          },
          60
        )
      );
    }
  }
  return recs;
}

/**
 * Warning - High Frequency: ad set frequency > 2.0
 */
function checkHighFrequency(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAdSets = collectActiveAdSets(campaigns);

  for (const { adSet, campaign } of activeAdSets) {
    if (adSet.metrics.frequency > 2.0) {
      const reducedBudget = Math.round(adSet.dailyBudget * 0.6);
      recs.push(
        makeRec(
          'warning',
          'targeting',
          'High Frequency Alert',
          `Ad set "${adSet.name}" in "${campaign.name}" has a frequency of ${adSet.metrics.frequency.toFixed(2)}. The audience is seeing ads too often, which leads to ad fatigue and wasted spend.`,
          `Refresh the audience or decrease daily budget from ${fmt$(adSet.dailyBudget)} to ${fmt$(reducedBudget)} to reduce delivery pressure.`,
          `Could reduce wasted impressions by ~${Math.round((1 - reducedBudget / adSet.dailyBudget) * 100)}%`,
          {
            type: 'decrease_budget',
            entityType: 'adset',
            entityId: adSet.id,
            entityName: adSet.name,
            payload: {
              newBudget: reducedBudget,
              currentBudget: adSet.dailyBudget,
            },
          },
          90
        )
      );
    }
  }
  return recs;
}

/**
 * Warning - Diminishing Returns: campaign CPA > account average CPA * 2
 */
function checkDiminishingReturns(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'ACTIVE' && c.metrics.conversions > 0
  );
  if (activeCampaigns.length < 2) return recs;

  const accountAvgCPA =
    activeCampaigns.reduce((sum, c) => sum + c.metrics.cpa, 0) / activeCampaigns.length;

  for (const campaign of activeCampaigns) {
    if (campaign.metrics.cpa > accountAvgCPA * 2) {
      const reducedBudget = Math.round(campaign.dailyBudget * 0.7);
      recs.push(
        makeRec(
          'warning',
          'budget',
          'Diminishing Returns on Spend',
          `Campaign "${campaign.name}" has a CPA of ${fmt$(campaign.metrics.cpa)}, which is ${(campaign.metrics.cpa / accountAvgCPA).toFixed(1)}x the account average CPA of ${fmt$(accountAvgCPA)}. You're hitting diminishing returns.`,
          `Reduce daily budget from ${fmt$(campaign.dailyBudget)} to ${fmt$(reducedBudget)} to operate at peak efficiency.`,
          `Save ~${fmt$(campaign.dailyBudget - reducedBudget)}/day while maintaining most conversions`,
          {
            type: 'decrease_budget',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {
              newBudget: reducedBudget,
              currentBudget: campaign.dailyBudget,
            },
          },
          120
        )
      );
    }
  }
  return recs;
}

/**
 * Opportunity - Scale Winner: ad set ROAS > 3.0 AND spend > $500
 */
function checkScaleWinners(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAdSets = collectActiveAdSets(campaigns);

  for (const { adSet, campaign } of activeAdSets) {
    const { roas, spend, cpa } = adSet.metrics;
    if (roas > 3.0 && spend > 500 && campaign.dailyBudget < 10000) {
      const increasePercent = roas > 4.0 ? 50 : 30;
      const newBudget = Math.round(adSet.dailyBudget * (1 + increasePercent / 100));
      recs.push(
        makeRec(
          'opportunity',
          'budget',
          'Scale Top Performer',
          `Ad set "${adSet.name}" in "${campaign.name}" has maintained ${fmtX(roas)} ROAS with consistent CPA (${fmt$(cpa)}) on ${fmt$(spend)} total spend. There's room to scale without risking performance.`,
          `Increase daily budget from ${fmt$(adSet.dailyBudget)} to ${fmt$(newBudget)} (${increasePercent}% increase) to capture more conversions.`,
          `Projected +${Math.round(((newBudget - adSet.dailyBudget) / cpa) * 7)} conversions/week at similar ROAS`,
          {
            type: 'increase_budget',
            entityType: 'adset',
            entityId: adSet.id,
            entityName: adSet.name,
            payload: {
              newBudget,
              currentBudget: adSet.dailyBudget,
            },
          },
          150
        )
      );
    }
  }
  return recs;
}

/**
 * Opportunity - Reallocate Budget: highest ROAS campaign > 2x lowest ROAS campaign
 */
function checkReallocateBudget(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'ACTIVE' && c.metrics.spend > 0
  );
  if (activeCampaigns.length < 2) return recs;

  const sorted = [...activeCampaigns].sort((a, b) => b.metrics.roas - a.metrics.roas);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best.metrics.roas > worst.metrics.roas * 2 && worst.metrics.roas > 0) {
    const shiftAmount = Math.round(worst.dailyBudget * 0.3);
    recs.push(
      makeRec(
        'opportunity',
        'budget',
        'Reallocate Budget to Winner',
        `Campaign "${best.name}" is outperforming with ${fmtX(best.metrics.roas)} ROAS while "${worst.name}" has only ${fmtX(worst.metrics.roas)} ROAS. Shifting budget from the underperformer to the winner can improve overall account ROAS.`,
        `Increase "${best.name}" budget by ${fmt$(shiftAmount)}/day and decrease "${worst.name}" by the same amount.`,
        `Expected additional revenue: ~${fmt$(shiftAmount * best.metrics.roas)}/day at current ROAS`,
        {
          type: 'reallocate_budget',
          entityType: 'campaign',
          entityId: best.id,
          entityName: best.name,
          payload: {
            newBudget: best.dailyBudget + shiftAmount,
            currentBudget: best.dailyBudget,
            targetEntityId: worst.id,
            targetEntityName: worst.name,
          },
        },
        180
      )
    );
  }
  return recs;
}

/**
 * Opportunity - Duplicate Winning Creative: highest ROAS ad in each campaign
 */
function checkDuplicateWinningCreative(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const activeAdSets = campaign.adSets.filter((as) => as.status === 'ACTIVE');
    if (activeAdSets.length < 2) continue;

    // Find the best performing ad across all ad sets in this campaign
    let bestAd: Ad | null = null;
    let bestAdSet: AdSet | null = null;
    let bestRoas = 0;

    for (const adSet of activeAdSets) {
      for (const ad of adSet.ads) {
        if (ad.status === 'ACTIVE' && ad.metrics.roas > bestRoas && ad.metrics.spend > 0) {
          bestRoas = ad.metrics.roas;
          bestAd = ad;
          bestAdSet = adSet;
        }
      }
    }

    if (!bestAd || !bestAdSet || bestRoas <= 0) continue;

    // Find a target ad set that doesn't contain this ad
    const targetAdSet = activeAdSets.find((as) => as.id !== bestAdSet!.id);
    if (!targetAdSet) continue;

    recs.push(
      makeRec(
        'opportunity',
        'creative',
        'Duplicate Winning Creative',
        `Ad "${bestAd.name}" has the highest ROAS (${fmtX(bestAd.metrics.roas)}) and CPA of ${fmt$(bestAd.metrics.cpa)} in campaign "${campaign.name}". It's only running in ad set "${bestAdSet.name}".`,
        `Duplicate this creative into the "${targetAdSet.name}" ad set to test if it performs well with a different audience.`,
        `If it performs at 75% of current ROAS, could add ~${fmt$((bestAd.metrics.revenue / 7) * 0.75)}/day in revenue`,
        {
          type: 'refresh_creative',
          entityType: 'ad',
          entityId: bestAd.id,
          entityName: bestAd.name,
          payload: {
            targetEntityId: targetAdSet.id,
            targetEntityName: targetAdSet.name,
          },
        },
        200
      )
    );
  }
  return recs;
}

// ---- strategic / account-level analyzers ----

/**
 * Warning/Opportunity - Account Spend Efficiency: overall ROAS health check
 */
function checkAccountSpendEfficiency(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'ACTIVE' && c.metrics.spend > 0
  );
  if (activeCampaigns.length === 0) return recs;

  const totalSpend = activeCampaigns.reduce((sum, c) => sum + c.metrics.spend, 0);
  const totalRevenue = activeCampaigns.reduce((sum, c) => sum + c.metrics.revenue, 0);

  if (totalSpend === 0) return recs;

  const accountRoas = totalRevenue / totalSpend;

  if (accountRoas < 2.0) {
    recs.push(
      makeRec(
        'warning',
        'budget',
        'Account-Level ROAS Below Profitability Threshold',
        `Your account-level ROAS is ${fmtX(accountRoas)}. For profitability after margins, you need at least 2.0x. Focus budget on your top 3 campaigns.`,
        'Audit all campaigns: pause anything below 1.5x ROAS and shift budget to top performers.',
        `Improving account ROAS to 2.0x would generate ~${fmt$(totalSpend * 2.0 - totalRevenue)} more revenue on current spend`,
        {
          type: 'decrease_budget',
          entityType: 'campaign',
          entityId: 'account-level',
          entityName: 'Account Budget Strategy',
          payload: {},
        },
        10
      )
    );
  } else if (accountRoas > 4.0) {
    recs.push(
      makeRec(
        'opportunity',
        'budget',
        'Account ROAS Supports Scaling',
        `Your account ROAS is ${fmtX(accountRoas)}, which is excellent. You have room to increase spend by 20-30% while maintaining profitability.`,
        'Increase overall account budget by 25% across top-performing campaigns.',
        `Projected additional revenue: ~${fmt$(totalSpend * 0.25 * accountRoas)}/week at current ROAS`,
        {
          type: 'scale_budget',
          entityType: 'campaign',
          entityId: 'account-level',
          entityName: 'Account Budget Strategy',
          payload: {
            budgetMultiplier: 1.25,
          },
        },
        10
      )
    );
  }

  return recs;
}

/**
 * Warning - Campaign Structure Health: ad set count per campaign
 */
function checkCampaignStructureHealth(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const activeAdSets = campaign.adSets.filter((as) => as.status === 'ACTIVE');
    const adSetCount = activeAdSets.length;

    if (adSetCount === 1) {
      recs.push(
        makeRec(
          'warning',
          'targeting',
          'Insufficient Ad Set Testing',
          `Campaign "${campaign.name}" has only 1 active ad set. Best practice is 3-5 ad sets for proper audience testing.`,
          'Create 2-4 additional ad sets with different audience segments to find the most responsive audience.',
          'Proper audience testing typically improves ROAS by 20-40%',
          {
            type: 'adjust_targeting',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {},
          },
          45
        )
      );
    } else if (adSetCount > 10) {
      recs.push(
        makeRec(
          'warning',
          'targeting',
          'Too Many Ad Sets Fragmenting Budget',
          `Campaign "${campaign.name}" has ${adSetCount} active ad sets. This fragments budget and prevents any single ad set from exiting the learning phase.`,
          'Consolidate to 3-5 top performers. Pause the lowest-ROAS ad sets to concentrate budget.',
          'Consolidation could improve delivery efficiency by 30-50%',
          {
            type: 'adjust_targeting',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {},
          },
          45
        )
      );
    }
  }

  return recs;
}

/**
 * Opportunity - Scaling Readiness: campaigns ready to scale based on performance signals
 */
function checkScalingReadiness(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const { roas, spend, conversions, cpa } = campaign.metrics;

    // Scaling criteria: ROAS > 2.5, spend > $1000, stable CPA (>20 conversions)
    if (roas > 2.5 && spend > 1000 && conversions > 20) {
      const newBudget = Math.round(campaign.dailyBudget * 1.2);
      recs.push(
        makeRec(
          'opportunity',
          'budget',
          'Campaign Ready to Scale',
          `Campaign "${campaign.name}" is scaling-ready: ${fmtX(roas)} ROAS, ${conversions} conversions, stable CPA at ${fmt$(cpa)}. Recommend 20% budget increase.`,
          `Increase daily budget from ${fmt$(campaign.dailyBudget)} to ${fmt$(newBudget)} to capture more conversions at profitable CPA.`,
          `Projected +${Math.round(((newBudget - campaign.dailyBudget) / cpa) * 7)} conversions/week at current CPA`,
          {
            type: 'increase_budget',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {
              newBudget,
              currentBudget: campaign.dailyBudget,
            },
          },
          80
        )
      );
    }
  }

  return recs;
}

/**
 * Warning - Learning Phase Stuck: high spend but not enough conversions to exit learning
 */
function checkLearningPhaseStuck(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const { spend, conversions } = campaign.metrics;

    // Stuck in learning: spend > $200 but fewer than 10 conversions
    if (spend > 200 && conversions < 10) {
      recs.push(
        makeRec(
          'warning',
          'status',
          'Campaign Stuck in Learning Phase',
          `Campaign "${campaign.name}" may be stuck in learning phase: only ${conversions} conversions on ${fmt$(spend)} spend. Meta needs ~50 conversions/week. Consider broader targeting or lower-funnel events.`,
          'Broaden audience targeting, switch to a higher-volume conversion event (e.g., Add to Cart instead of Purchase), or consolidate ad sets.',
          'Exiting learning phase can reduce CPA by 20-30%',
          {
            type: 'adjust_targeting',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {},
          },
          100
        )
      );
    }
  }

  return recs;
}

/**
 * Warning - Budget Concentration: one campaign using > 60% of total spend
 */
function checkBudgetConcentration(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'ACTIVE' && c.metrics.spend > 0
  );
  if (activeCampaigns.length < 2) return recs;

  const totalSpend = activeCampaigns.reduce((sum, c) => sum + c.metrics.spend, 0);
  if (totalSpend === 0) return recs;

  for (const campaign of activeCampaigns) {
    const spendPct = (campaign.metrics.spend / totalSpend) * 100;

    if (spendPct > 60) {
      recs.push(
        makeRec(
          'warning',
          'budget',
          'Budget Over-Concentrated in One Campaign',
          `Campaign "${campaign.name}" uses ${fmtPct(spendPct)} of your total ad spend. This concentration is risky. Diversify by allocating 20-30% to prospecting campaigns.`,
          'Gradually shift 20-30% of this campaign\'s budget to new prospecting or retargeting campaigns to reduce dependency on a single campaign.',
          'Diversification reduces risk and often discovers new profitable audiences',
          {
            type: 'reallocate_budget',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {
              currentBudget: campaign.dailyBudget,
            },
          },
          130
        )
      );
    }
  }

  return recs;
}

/**
 * Critical - Conversion Objective Mismatch: campaigns optimizing for wrong objective
 */
function checkConversionObjectiveMismatch(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const { objective } = campaign;
    const { purchases, purchaseValue, conversions } = campaign.metrics;

    // Campaigns with REACH or TRAFFIC objective that have significant conversions
    if (
      (objective === 'REACH' || objective === 'TRAFFIC') &&
      conversions > 20
    ) {
      recs.push(
        makeRec(
          'critical',
          'targeting',
          'Conversion Objective Mismatch',
          `Campaign "${campaign.name}" optimizes for ${objective} but generated ${purchases > 0 ? purchases : conversions} purchases worth ${fmt$(purchaseValue > 0 ? purchaseValue : campaign.metrics.revenue)}. Switch to CONVERSIONS objective to let Meta optimize for buyers.`,
          'Duplicate this campaign with a CONVERSIONS objective targeting Purchase events. Meta\'s algorithm will find more buyers when optimizing for the right event.',
          'Switching to purchase optimization typically improves ROAS by 40-80%',
          {
            type: 'adjust_targeting',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {},
          },
          160
        )
      );
    }
  }

  return recs;
}

// ---- bid strategy analyzers ----

/**
 * Warning - Switch to Cost Cap: campaigns using LOWEST_COST with CPA variance > 30%
 * across ad sets, indicating inconsistent acquisition costs.
 */
function checkSwitchToCostCap(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE' || campaign.bidStrategy !== 'LOWEST_COST') continue;

    const activeAdSets = campaign.adSets.filter(
      (as) => as.status === 'ACTIVE' && as.metrics.conversions > 0
    );
    if (activeAdSets.length < 2) continue;

    const cpas = activeAdSets.map((as) => as.metrics.cpa);
    const avgCPA = cpas.reduce((sum, c) => sum + c, 0) / cpas.length;
    if (avgCPA === 0) continue;

    // Calculate CPA variance as (max - min) / avg
    const minCPA = Math.min(...cpas);
    const maxCPA = Math.max(...cpas);
    const variance = (maxCPA - minCPA) / avgCPA;

    if (variance > 0.3) {
      // Suggest target CPA = best ad set's CPA * 1.1
      const suggestedBid = Math.round(minCPA * 1.1 * 100) / 100;

      recs.push(
        makeRec(
          'warning',
          'bidStrategy',
          'Switch to Cost Cap Strategy',
          `Campaign "${campaign.name}" uses Lowest Cost but CPA ranges from ${fmt$(minCPA)} to ${fmt$(maxCPA)} across ad sets. This inconsistency means Meta is overspending on some audiences.`,
          `Switch to COST_CAP with a target CPA of ${fmt$(suggestedBid)} (best ad set CPA + 10% buffer) to enforce consistent acquisition costs.`,
          `Could reduce CPA variance by ~${Math.round(variance * 100 - 30)}% and save ~${fmt$((maxCPA - suggestedBid) * (campaign.metrics.conversions / 7))}/day`,
          {
            type: 'change_bid_strategy',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: { newBidStrategy: 'COST_CAP', suggestedBid },
          },
          40
        )
      );
    }
  }
  return recs;
}

/**
 * Opportunity - Switch to Bid Cap: mature campaigns with ROAS > 3.0 and stable CPA
 * (variance < 20%) that could benefit from more aggressive bidding.
 */
function checkSwitchToBidCap(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;
    if (campaign.bidStrategy !== 'COST_CAP' && campaign.bidStrategy !== 'LOWEST_COST') continue;
    if (campaign.metrics.roas <= 3.0 || campaign.metrics.conversions === 0) continue;

    const activeAdSets = campaign.adSets.filter(
      (as) => as.status === 'ACTIVE' && as.metrics.conversions > 0
    );
    if (activeAdSets.length < 2) continue;

    const cpas = activeAdSets.map((as) => as.metrics.cpa);
    const avgCPA = cpas.reduce((sum, c) => sum + c, 0) / cpas.length;
    if (avgCPA === 0) continue;

    const minCPA = Math.min(...cpas);
    const maxCPA = Math.max(...cpas);
    const variance = (maxCPA - minCPA) / avgCPA;

    if (variance < 0.2) {
      const suggestedBid = Math.round(avgCPA * 1.2 * 100) / 100;

      recs.push(
        makeRec(
          'opportunity',
          'bidStrategy',
          'Switch to Bid Cap for Scale',
          `Campaign "${campaign.name}" has proven stable performance (${fmtX(campaign.metrics.roas)} ROAS, CPA variance <20%). BID_CAP can help capture more auction wins at a predictable cost.`,
          `Switch to BID_CAP with a bid of ${fmt$(suggestedBid)} (avg CPA + 20% headroom) to maximize conversion volume.`,
          `Could increase conversions by ~15-25% while maintaining ${fmtX(campaign.metrics.roas)}+ ROAS`,
          {
            type: 'change_bid_strategy',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: { newBidStrategy: 'BID_CAP', suggestedBid },
          },
          65
        )
      );
    }
  }
  return recs;
}

/**
 * Critical - Bid Cap Too Low: campaigns using BID_CAP where spend is significantly
 * under daily budget (< 60%), indicating the bid cap is too restrictive.
 */
function checkBidCapTooLow(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE' || campaign.bidStrategy !== 'BID_CAP') continue;
    if (campaign.dailyBudget === 0) continue;

    // Estimate daily spend from total metrics (assume 7-day window)
    const estimatedDailySpend = campaign.metrics.spend / 7;
    const spendRatio = estimatedDailySpend / campaign.dailyBudget;

    if (spendRatio < 0.6) {
      const spendPct = Math.round(spendRatio * 100);

      // Find the current effective bid from ad sets
      const biddingAdSets = campaign.adSets.filter(
        (as) => as.status === 'ACTIVE' && as.bidAmount !== null
      );
      const currentBid = biddingAdSets.length > 0
        ? biddingAdSets.reduce((sum, as) => sum + (as.bidAmount ?? 0), 0) / biddingAdSets.length
        : campaign.metrics.cpa;
      const suggestedBid = Math.round(currentBid * 1.25 * 100) / 100;

      recs.push(
        makeRec(
          'critical',
          'bidStrategy',
          'Bid Cap Too Restrictive',
          `Campaign "${campaign.name}" with BID_CAP is only spending ${fmt$(estimatedDailySpend)} of ${fmt$(campaign.dailyBudget)} daily budget (${spendPct}%). Your bid cap is too restrictive, causing you to miss winnable auctions.`,
          `Increase bid cap by 25% to ${fmt$(suggestedBid)}, or switch to COST_CAP to let Meta optimize delivery while still controlling costs.`,
          `Could unlock ~${fmt$(campaign.dailyBudget - estimatedDailySpend)}/day in unspent budget for additional conversions`,
          {
            type: 'change_bid_strategy',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: { newBidStrategy: 'BID_CAP', suggestedBid },
          },
          85
        )
      );
    }
  }
  return recs;
}

/**
 * Opportunity - Minimum ROAS Strategy: conversion campaigns with ROAS > 2.0 that
 * aren't using MINIMUM_ROAS and could benefit from automated ROAS-based bidding.
 */
function checkMinRoasOpportunity(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;
    if (campaign.objective !== 'CONVERSIONS') continue;
    if (campaign.bidStrategy === 'MINIMUM_ROAS') continue;
    if (campaign.metrics.roas <= 2.0 || campaign.metrics.spend === 0) continue;

    // Conservative target: current ROAS * 0.7
    const targetRoas = Math.round(campaign.metrics.roas * 0.7 * 100) / 100;

    recs.push(
      makeRec(
        'opportunity',
        'bidStrategy',
        'Try Minimum ROAS Strategy',
        `Campaign "${campaign.name}" consistently achieves ${fmtX(campaign.metrics.roas)} ROAS. Using MINIMUM_ROAS strategy could automate bid optimization while maintaining profitability.`,
        `Switch to MINIMUM_ROAS with a target of ${fmtX(targetRoas)} (30% below current to give Meta room to optimize). This lets Meta's algorithm find the best bids automatically.`,
        `Could improve efficiency by 10-20% through automated ROAS-based bid optimization`,
        {
          type: 'change_bid_strategy',
          entityType: 'campaign',
          entityId: campaign.id,
          entityName: campaign.name,
          payload: { newBidStrategy: 'MINIMUM_ROAS', suggestedBid: targetRoas },
        },
        110
      )
    );
  }
  return recs;
}

// ---- deep ad-set & ad level analyzers ----

/**
 * Warning - Audience Overlap: ad sets in the same campaign targeting similar audiences.
 * Looks for shared interests or custom audiences between ad sets, which causes
 * self-competition and inflated CPMs.
 */
function checkAdSetAudienceOverlap(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const activeAdSets = campaign.adSets.filter((as) => as.status === 'ACTIVE');
    if (activeAdSets.length < 2) continue;

    // Compare each pair of ad sets for audience overlap
    for (let i = 0; i < activeAdSets.length; i++) {
      for (let j = i + 1; j < activeAdSets.length; j++) {
        const a = activeAdSets[i];
        const b = activeAdSets[j];

        const sharedInterests = a.targeting.interests.filter((interest) =>
          b.targeting.interests.includes(interest)
        );
        const sharedCustomAudiences = a.targeting.customAudiences.filter((ca) =>
          b.targeting.customAudiences.includes(ca)
        );

        const totalShared = sharedInterests.length + sharedCustomAudiences.length;
        const totalA = a.targeting.interests.length + a.targeting.customAudiences.length;
        const totalB = b.targeting.interests.length + b.targeting.customAudiences.length;
        const minTotal = Math.min(totalA, totalB);

        // Only flag if there's meaningful overlap (at least 1 shared AND > 50% of smaller set)
        if (totalShared > 0 && minTotal > 0 && totalShared / minTotal > 0.5) {
          const overlapDetails = [
            ...(sharedInterests.length > 0
              ? [`interests: ${sharedInterests.slice(0, 3).join(', ')}${sharedInterests.length > 3 ? '...' : ''}`]
              : []),
            ...(sharedCustomAudiences.length > 0
              ? [`${sharedCustomAudiences.length} custom audience(s)`]
              : []),
          ].join(' and ');

          recs.push(
            makeRec(
              'warning',
              'targeting',
              'Audience Overlap Detected',
              `Ad sets "${a.name}" and "${b.name}" in campaign "${campaign.name}" target overlapping audiences (${overlapDetails}). This causes self-competition, increasing your CPM.`,
              'Differentiate targeting between these ad sets or consolidate them into one ad set to stop bidding against yourself.',
              'Could reduce CPM by 15-25% by eliminating self-competition',
              {
                type: 'adjust_targeting',
                entityType: 'adset',
                entityId: a.id,
                entityName: a.name,
                payload: {
                  targetEntityId: b.id,
                  targetEntityName: b.name,
                },
              },
              35
            )
          );
        }
      }
    }
  }

  return recs;
}

/**
 * Opportunity - Creative Type Concentration: campaign has >3 ads but all the same creative type.
 * Diversifying creative types (image, video, carousel) typically improves performance.
 */
function checkAdCreativeTypeConcentration(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;
    if (campaign.adSets.length === 0) continue;

    // Collect all active ads in this campaign
    const activeAds: { ad: Ad; adSet: AdSet }[] = [];
    for (const adSet of campaign.adSets) {
      for (const ad of adSet.ads) {
        if (ad.status === 'ACTIVE') {
          activeAds.push({ ad, adSet });
        }
      }
    }

    if (activeAds.length <= 3) continue;

    // Check if all ads share the same creative type
    const types = new Set(activeAds.map(({ ad }) => ad.creative.type));
    if (types.size === 1) {
      const creativeType = activeAds[0].ad.creative.type;
      const suggestions =
        creativeType === 'image'
          ? 'video or carousel'
          : creativeType === 'video'
          ? 'static image or carousel'
          : 'image or video';

      recs.push(
        makeRec(
          'opportunity',
          'creative',
          'Creative Type Concentration',
          `Campaign "${campaign.name}" has ${activeAds.length} ads all using ${creativeType} creative. Relying on a single format limits audience engagement potential.`,
          `Diversify by testing ${suggestions} creatives to reach users who respond better to different formats.`,
          'Mixed creative formats typically improve overall CTR by 20-40%',
          {
            type: 'refresh_creative',
            entityType: 'campaign',
            entityId: campaign.id,
            entityName: campaign.name,
            payload: {},
          },
          50
        )
      );
    }
  }

  return recs;
}

/**
 * Warning - Ad Set Budget Imbalance: within a campaign, a high-ROAS ad set gets less budget
 * than a low-ROAS ad set. Budget should flow toward performance.
 */
function checkAdSetBudgetImbalance(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== 'ACTIVE') continue;

    const activeAdSets = campaign.adSets.filter(
      (as) => as.status === 'ACTIVE' && as.metrics.spend > 0
    );
    if (activeAdSets.length < 2) continue;

    // Compare each pair for budget imbalance
    for (let i = 0; i < activeAdSets.length; i++) {
      for (let j = i + 1; j < activeAdSets.length; j++) {
        const a = activeAdSets[i];
        const b = activeAdSets[j];

        // Skip if either has zero ROAS (no conversions yet)
        if (a.metrics.roas === 0 || b.metrics.roas === 0) continue;

        let highPerformer: AdSet;
        let lowPerformer: AdSet;

        if (a.metrics.roas > b.metrics.roas * 2 && a.dailyBudget < b.dailyBudget) {
          highPerformer = a;
          lowPerformer = b;
        } else if (b.metrics.roas > a.metrics.roas * 2 && b.dailyBudget < a.dailyBudget) {
          highPerformer = b;
          lowPerformer = a;
        } else {
          continue;
        }

        const shiftAmount = Math.round(lowPerformer.dailyBudget * 0.3);

        recs.push(
          makeRec(
            'warning',
            'budget',
            'Ad Set Budget Imbalance',
            `Ad set "${highPerformer.name}" has ${fmtX(highPerformer.metrics.roas)} ROAS but only ${fmt$(highPerformer.dailyBudget)}/day budget, while ad set "${lowPerformer.name}" has lower ${fmtX(lowPerformer.metrics.roas)} ROAS with ${fmt$(lowPerformer.dailyBudget)}/day budget. Rebalance to maximize returns.`,
            `Shift ${fmt$(shiftAmount)}/day from "${lowPerformer.name}" to "${highPerformer.name}" to align budget with performance.`,
            `Could improve campaign ROAS by reallocating ~${fmt$(shiftAmount)}/day to the ${fmtX(highPerformer.metrics.roas)} performer`,
            {
              type: 'reallocate_budget',
              entityType: 'adset',
              entityId: highPerformer.id,
              entityName: highPerformer.name,
              payload: {
                newBudget: highPerformer.dailyBudget + shiftAmount,
                currentBudget: highPerformer.dailyBudget,
                targetEntityId: lowPerformer.id,
                targetEntityName: lowPerformer.name,
              },
            },
            70
          )
        );
      }
    }
  }

  return recs;
}

/**
 * Warning - Stale Ads: active ads with high spend (>$500) but declining metrics.
 * Low CTR (<1%) combined with high frequency (>2.5) indicates a stale creative.
 */
function checkStaleAds(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAds = collectActiveAds(campaigns);

  for (const { ad, adSet, campaign } of activeAds) {
    const { spend, ctr, frequency } = ad.metrics;
    if (spend > 500 && ctr < 1.0 && frequency > 2.5) {
      recs.push(
        makeRec(
          'warning',
          'creative',
          'Stale Ad — Time for Fresh Creative',
          `Ad "${ad.name}" in "${adSet.name}" (campaign "${campaign.name}") has been running with ${fmt$(spend)} spend, CTR dropped to ${fmtPct(ctr)} and frequency is at ${frequency.toFixed(2)}. The audience has been over-saturated with this creative.`,
          'Pause this ad and launch new creative variants with refreshed messaging, visuals, or format.',
          'Fresh creative typically recovers CTR by 40-60%',
          {
            type: 'refresh_creative',
            entityType: 'ad',
            entityId: ad.id,
            entityName: ad.name,
            payload: { newStatus: 'PAUSED' },
          },
          95
        )
      );
    }
  }

  return recs;
}

/**
 * Critical - Low Conversion Rate Ad Sets: getting clicks but not converting.
 * CVR < 1% with >$300 spend and >500 clicks indicates targeting or landing page issues.
 */
function checkLowConversionRateAdSets(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAdSets = collectActiveAdSets(campaigns);

  for (const { adSet, campaign } of activeAdSets) {
    const { cvr, spend, clicks } = adSet.metrics;
    if (cvr < 1.0 && spend > 300 && clicks > 500) {
      recs.push(
        makeRec(
          'critical',
          'targeting',
          'Low Conversion Rate — Targeting Too Broad',
          `Ad set "${adSet.name}" in campaign "${campaign.name}" is getting clicks (${clicks.toLocaleString()}) but not converting (CVR: ${fmtPct(cvr)}). With ${fmt$(spend)} spent, the targeting may be too broad or the landing page isn't resonating.`,
          'Narrow targeting with lookalike audiences, add exclusions, or test a different landing page to improve CVR.',
          `Improving CVR to 2% could generate ~${Math.round(clicks * 0.01)} more conversions from existing traffic`,
          {
            type: 'adjust_targeting',
            entityType: 'adset',
            entityId: adSet.id,
            entityName: adSet.name,
            payload: {},
          },
          110
        )
      );
    }
  }

  return recs;
}

/**
 * Opportunity - Top Performer Scaling: ads with ROAS > 4.0 and spend > $200 are proven winners
 * that should be duplicated into new ad sets with expanded audiences.
 */
function checkTopPerformerScaling(campaigns: Campaign[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const activeAds = collectActiveAds(campaigns);

  for (const { ad, adSet, campaign } of activeAds) {
    const { roas, spend, revenue, cpa } = ad.metrics;
    if (roas > 4.0 && spend > 200) {
      const dailyRevenue = revenue / 7; // approximate daily
      const projectedGain = dailyRevenue * 0.5; // 50% of current as incremental

      recs.push(
        makeRec(
          'opportunity',
          'budget',
          'Scale Top Performing Ad',
          `Ad "${ad.name}" in "${adSet.name}" (campaign "${campaign.name}") is your best performer with ${fmtX(roas)} ROAS on ${fmt$(spend)} spend and ${fmt$(cpa)} CPA. This is a proven winner worth scaling.`,
          'Duplicate this ad into new ad sets with expanded lookalike audiences to capture incremental conversions at similar efficiency.',
          `Scaling could add ~${fmt$(projectedGain)}/day in additional revenue at similar ROAS`,
          {
            type: 'increase_budget',
            entityType: 'ad',
            entityId: ad.id,
            entityName: ad.name,
            payload: {
              targetEntityId: adSet.id,
              targetEntityName: adSet.name,
            },
          },
          140
        )
      );
    }
  }

  return recs;
}

// ---- dayparting analyzers ----

const HOUR_LABELS = [
  '12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am',
  '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm',
];

interface HourlyAggregate {
  hour: number;
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  count: number;
  avgRoas: number;
}

function aggregateByHour(hourlyData: HourlyPnLEntry[]): HourlyAggregate[] {
  const buckets: Record<number, { spend: number; revenue: number; conversions: number; count: number }> = {};
  for (let h = 0; h < 24; h++) {
    buckets[h] = { spend: 0, revenue: 0, conversions: 0, count: 0 };
  }
  for (const entry of hourlyData) {
    const b = buckets[entry.hour];
    b.spend += entry.spend;
    b.revenue += entry.revenue;
    b.conversions += entry.conversions;
    b.count += 1;
  }
  return Array.from({ length: 24 }, (_, h) => {
    const b = buckets[h];
    const avgSpend = b.count > 0 ? b.spend / b.count : 0;
    const avgRevenue = b.count > 0 ? b.revenue / b.count : 0;
    return {
      hour: h,
      totalSpend: b.spend,
      totalRevenue: b.revenue,
      totalConversions: b.conversions,
      count: b.count,
      avgRoas: avgSpend > 0 ? avgRevenue / avgSpend : 0,
    };
  });
}

function overallAvgRoas(agg: HourlyAggregate[]): number {
  const totalSpend = agg.reduce((s, a) => s + a.totalSpend, 0);
  const totalRevenue = agg.reduce((s, a) => s + a.totalRevenue, 0);
  return totalSpend > 0 ? totalRevenue / totalSpend : 0;
}

function formatHourRange(hours: number[]): string {
  if (hours.length === 0) return '';
  if (hours.length === 1) return HOUR_LABELS[hours[0]];
  return `${HOUR_LABELS[hours[0]]}-${HOUR_LABELS[hours[hours.length - 1]]}`;
}

/**
 * Opportunity - Scale During Peak Hours: consecutive hours with ROAS > 1.5x overall average
 */
function checkBestHours(hourlyData: HourlyPnLEntry[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const agg = aggregateByHour(hourlyData);
  const avgRoas = overallAvgRoas(agg);

  if (avgRoas <= 0) return recs;

  // Find consecutive hour ranges where avg ROAS > 1.5x overall average
  const peakHours: number[] = [];
  for (const a of agg) {
    if (a.avgRoas > avgRoas * 1.5 && a.count > 0) {
      peakHours.push(a.hour);
    }
  }

  if (peakHours.length === 0) return recs;

  // Group into consecutive ranges
  const ranges: number[][] = [];
  let currentRange: number[] = [peakHours[0]];
  for (let i = 1; i < peakHours.length; i++) {
    if (peakHours[i] === peakHours[i - 1] + 1) {
      currentRange.push(peakHours[i]);
    } else {
      ranges.push(currentRange);
      currentRange = [peakHours[i]];
    }
  }
  ranges.push(currentRange);

  // Use the longest consecutive range
  const bestRange = ranges.reduce((a, b) => (a.length >= b.length ? a : b));
  const rangeAgg = bestRange.map((h) => agg[h]);
  const rangeAvgRoas =
    rangeAgg.reduce((s, a) => s + a.totalRevenue, 0) /
    Math.max(rangeAgg.reduce((s, a) => s + a.totalSpend, 0), 1);
  const pctAbove = ((rangeAvgRoas - avgRoas) / avgRoas) * 100;
  const avgDailySpend = rangeAgg.reduce((s, a) => s + a.totalSpend, 0) / Math.max(rangeAgg[0]?.count || 1, 1);
  const additionalRevenue = avgDailySpend * 0.25 * rangeAvgRoas;

  recs.push(
    makeRec(
      'opportunity',
      'dayparting',
      'Scale During Peak Hours',
      `Hours ${formatHourRange(bestRange)} show avg ROAS of ${fmtX(rangeAvgRoas)}, which is ${Math.round(pctAbove)}% above your daily average of ${fmtX(avgRoas)}.`,
      `Increase budget by 20-30% during these peak hours to capture more high-ROAS conversions.`,
      `Could capture ~${fmt$(additionalRevenue)} more revenue/day at current ROAS`,
      {
        type: 'adjust_dayparting',
        entityType: 'campaign',
        entityId: 'account-level',
        entityName: 'Day-Parting Schedule',
        payload: {
          hours: bestRange,
          budgetMultiplier: 1.25,
        },
      },
      45
    )
  );

  return recs;
}

/**
 * Warning - Reduce Spend During Off-Peak Hours: hours with ROAS < 0.5x average OR ROAS < 1.0
 */
function checkWorstHours(hourlyData: HourlyPnLEntry[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const agg = aggregateByHour(hourlyData);
  const avgRoas = overallAvgRoas(agg);

  if (avgRoas <= 0) return recs;

  const offPeakHours: number[] = [];
  for (const a of agg) {
    if (a.count > 0 && (a.avgRoas < avgRoas * 0.5 || a.avgRoas < 1.0) && a.totalSpend > 0) {
      offPeakHours.push(a.hour);
    }
  }

  if (offPeakHours.length === 0) return recs;

  // Group into consecutive ranges
  const ranges: number[][] = [];
  let currentRange: number[] = [offPeakHours[0]];
  for (let i = 1; i < offPeakHours.length; i++) {
    if (offPeakHours[i] === offPeakHours[i - 1] + 1) {
      currentRange.push(offPeakHours[i]);
    } else {
      ranges.push(currentRange);
      currentRange = [offPeakHours[i]];
    }
  }
  ranges.push(currentRange);

  const worstRange = ranges.reduce((a, b) => (a.length >= b.length ? a : b));
  const rangeAgg = worstRange.map((h) => agg[h]);
  const rangeAvgRoas =
    rangeAgg.reduce((s, a) => s + a.totalRevenue, 0) /
    Math.max(rangeAgg.reduce((s, a) => s + a.totalSpend, 0), 1);
  const pctBelow = ((avgRoas - rangeAvgRoas) / avgRoas) * 100;

  recs.push(
    makeRec(
      'warning',
      'dayparting',
      'Reduce Spend During Off-Peak Hours',
      `Hours ${formatHourRange(worstRange)} avg ROAS of ${fmtX(rangeAvgRoas)} (${Math.round(pctBelow)}% below average). Budget during these hours is underperforming.`,
      `Reduce bids by 30% during off-peak hours to minimize wasted spend.`,
      `Could save ~${fmt$(rangeAgg.reduce((s, a) => s + a.totalSpend, 0) / Math.max(rangeAgg[0]?.count || 1, 1) * 0.3)}/day`,
      {
        type: 'adjust_dayparting',
        entityType: 'campaign',
        entityId: 'account-level',
        entityName: 'Day-Parting Schedule',
        payload: {
          hours: worstRange,
          budgetMultiplier: 0.7,
        },
      },
      55
    )
  );

  return recs;
}

/**
 * Critical - Wasted Spend During Low-ROAS Hours: high spend + ROAS < 1.0
 */
function checkHourlySpendWaste(hourlyData: HourlyPnLEntry[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const agg = aggregateByHour(hourlyData);

  // Find the average daily spend per hour
  const totalDays = agg[0]?.count || 1;
  const avgHourlySpendPerDay =
    agg.reduce((s, a) => s + a.totalSpend, 0) / (24 * totalDays);

  const wastefulHours: number[] = [];
  let totalWastedPerDay = 0;

  for (const a of agg) {
    const dailySpend = a.totalSpend / Math.max(a.count, 1);
    if (dailySpend > avgHourlySpendPerDay && a.avgRoas < 1.0 && a.totalSpend > 0) {
      wastefulHours.push(a.hour);
      totalWastedPerDay += dailySpend;
    }
  }

  // Only trigger if total wasted spend > $50/day
  if (wastefulHours.length === 0 || totalWastedPerDay < 50) return recs;

  // Sort and group consecutive
  wastefulHours.sort((a, b) => a - b);
  const rangeLabel =
    wastefulHours.length <= 3
      ? wastefulHours.map((h) => HOUR_LABELS[h]).join(', ')
      : formatHourRange(wastefulHours);

  recs.push(
    makeRec(
      'critical',
      'dayparting',
      'Wasted Spend During Low-ROAS Hours',
      `You're spending ${fmt$(totalWastedPerDay)}/day during hours ${rangeLabel} with ROAS below 1.0. This is actively losing money.`,
      `Pause delivery during these hours or dramatically reduce bids to stop the bleed.`,
      `Could save ~${fmt$(totalWastedPerDay)}/day by pausing these hours`,
      {
        type: 'adjust_dayparting',
        entityType: 'campaign',
        entityId: 'account-level',
        entityName: 'Day-Parting Schedule',
        payload: {
          hours: wastefulHours,
          budgetMultiplier: 0,
        },
      },
      20
    )
  );

  return recs;
}

/**
 * Opportunity - Peak Conversion Hour Detected: single best hour by ROAS with high conversions
 */
function checkPeakHourOpportunity(hourlyData: HourlyPnLEntry[]): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const agg = aggregateByHour(hourlyData);

  // Only consider hours with meaningful data
  const validHours = agg.filter((a) => a.count > 0 && a.totalConversions > 0);
  if (validHours.length === 0) return recs;

  // Find the single best hour: highest ROAS that also has above-median conversions
  const medianConversions = [...validHours]
    .sort((a, b) => a.totalConversions - b.totalConversions)
    [Math.floor(validHours.length / 2)]?.totalConversions || 0;

  const highConversionHours = validHours.filter((a) => a.totalConversions >= medianConversions);
  if (highConversionHours.length === 0) return recs;

  const bestHour = highConversionHours.reduce((best, a) => (a.avgRoas > best.avgRoas ? a : best));
  const avgDailyConversions = bestHour.totalConversions / Math.max(bestHour.count, 1);

  recs.push(
    makeRec(
      'opportunity',
      'dayparting',
      'Peak Conversion Hour Detected',
      `Hour ${HOUR_LABELS[bestHour.hour]} has ${fmtX(bestHour.avgRoas)} ROAS with ${avgDailyConversions.toFixed(1)} conversions/day. This is your best performing hour.`,
      `Consider increasing budget specifically for the ${HOUR_LABELS[bestHour.hour]} hour window to maximize high-quality conversions.`,
      `Could increase daily conversions by ~${Math.round(avgDailyConversions * 0.3)} at similar ROAS`,
      {
        type: 'adjust_dayparting',
        entityType: 'campaign',
        entityId: 'account-level',
        entityName: 'Day-Parting Schedule',
        payload: {
          hours: [bestHour.hour],
          budgetMultiplier: 1.3,
        },
      },
      75
    )
  );

  return recs;
}

// ---- main export ----

export function generateRecommendations(
  campaigns: Campaign[],
  hourlyData?: HourlyPnLEntry[]
): AIRecommendation[] {
  resetIdCounter();

  const allRecs: AIRecommendation[] = [
    // Critical
    ...checkUnderperformingAdSets(campaigns),
    ...checkHighCPAAds(campaigns),
    ...checkQualityScore(campaigns),
    // Warning
    ...checkCreativeFatigue(campaigns),
    ...checkHighFrequency(campaigns),
    ...checkDiminishingReturns(campaigns),
    // Opportunity
    ...checkScaleWinners(campaigns),
    ...checkReallocateBudget(campaigns),
    ...checkDuplicateWinningCreative(campaigns),
    // Strategic / Account-Level
    ...checkAccountSpendEfficiency(campaigns),
    ...checkCampaignStructureHealth(campaigns),
    ...checkScalingReadiness(campaigns),
    ...checkLearningPhaseStuck(campaigns),
    ...checkBudgetConcentration(campaigns),
    ...checkConversionObjectiveMismatch(campaigns),
    // Deep Ad-Set & Ad Level
    ...checkAdSetAudienceOverlap(campaigns),
    ...checkAdCreativeTypeConcentration(campaigns),
    ...checkAdSetBudgetImbalance(campaigns),
    ...checkStaleAds(campaigns),
    ...checkLowConversionRateAdSets(campaigns),
    ...checkTopPerformerScaling(campaigns),
    // Bid Strategy
    ...checkSwitchToCostCap(campaigns),
    ...checkSwitchToBidCap(campaigns),
    ...checkBidCapTooLow(campaigns),
    ...checkMinRoasOpportunity(campaigns),
    // Dayparting
    ...(hourlyData && hourlyData.length > 0 ? [
      ...checkBestHours(hourlyData),
      ...checkWorstHours(hourlyData),
      ...checkHourlySpendWaste(hourlyData),
      ...checkPeakHourOpportunity(hourlyData),
    ] : []),
  ];

  return allRecs;
}

/**
 * Calculate total estimated daily savings from applied recommendations.
 * Parses dollar amounts from impactEstimate strings and sums budget-related savings.
 */
export function calculateEstimatedSavings(recommendations: AIRecommendation[]): number {
  const applied = recommendations.filter((r) => r.status === 'applied');
  let totalSavings = 0;

  for (const rec of applied) {
    const { action, impactEstimate } = rec;

    // For pause actions, estimate daily savings from the entity's context in impactEstimate
    // For budget decrease actions, compute difference
    if (action.type === 'pause_entity' || action.type === 'decrease_budget') {
      // Try to extract a dollar amount from the impactEstimate string
      const match = impactEstimate.match(/\$([0-9,.]+)/);
      if (match) {
        totalSavings += parseFloat(match[1].replace(',', ''));
      }
    } else if (
      action.type === 'increase_budget' ||
      action.type === 'scale_budget' ||
      action.type === 'reallocate_budget'
    ) {
      // These are revenue-positive actions; extract projected revenue
      const match = impactEstimate.match(/\$([0-9,.]+)/);
      if (match) {
        totalSavings += parseFloat(match[1].replace(',', ''));
      }
    }
  }

  return totalSavings;
}
