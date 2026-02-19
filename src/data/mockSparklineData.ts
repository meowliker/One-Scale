export interface SparklineDataPoint {
  day: string;
  spend: number;
  revenue: number;
  roas: number;
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function generateTrend(
  baseSpend: number,
  baseRoas: number,
  pattern: 'up' | 'down' | 'stable' | 'paused'
): SparklineDataPoint[] {
  return days.map((day, i) => {
    let spendMultiplier: number;
    let roasMultiplier: number;

    switch (pattern) {
      case 'up':
        // Steady growth with realistic noise
        spendMultiplier = 0.85 + i * 0.05 + (Math.sin(i * 1.2) * 0.04);
        roasMultiplier = 0.82 + i * 0.06 + (Math.sin(i * 0.8) * 0.03);
        break;
      case 'down':
        // Declining performance
        spendMultiplier = 1.1 - i * 0.04 + (Math.sin(i * 1.5) * 0.03);
        roasMultiplier = 1.15 - i * 0.07 + (Math.sin(i * 0.9) * 0.02);
        break;
      case 'stable':
        // Oscillating around a baseline
        spendMultiplier = 0.95 + Math.sin(i * 1.1) * 0.08 + (i % 2 === 0 ? 0.02 : -0.01);
        roasMultiplier = 0.96 + Math.sin(i * 0.7) * 0.06 + (i % 3 === 0 ? 0.03 : 0);
        break;
      case 'paused':
        // Data trails off to zero in recent days
        if (i <= 3) {
          spendMultiplier = 0.9 - i * 0.05;
          roasMultiplier = 0.85 - i * 0.04;
        } else if (i === 4) {
          spendMultiplier = 0.2;
          roasMultiplier = 0.15;
        } else {
          spendMultiplier = 0;
          roasMultiplier = 0;
        }
        break;
    }

    const spend = Math.max(0, +(baseSpend * spendMultiplier).toFixed(2));
    const revenue = Math.max(0, +(spend * baseRoas * roasMultiplier).toFixed(2));
    const roas = spend > 0 ? +(revenue / spend).toFixed(2) : 0;

    return { day, spend, revenue, roas };
  });
}

// ----- Campaigns -----

const campSparklines: Record<string, SparklineDataPoint[]> = {
  // camp-1: Summer Sale - top performer, strong upward ROAS
  'camp-1': generateTrend(690, 3.98, 'up'),
  // camp-2: Brand Awareness - average/stable
  'camp-2': generateTrend(306, 1.60, 'stable'),
  // camp-3: Lead Gen - good, trending up
  'camp-3': generateTrend(265, 4.00, 'up'),
  // camp-4: Holiday Promo BFCM - paused
  'camp-4': generateTrend(1274, 4.77, 'paused'),
  // camp-5: Evergreen Retargeting - strong and trending up
  'camp-5': generateTrend(464, 4.80, 'up'),
  // camp-6: Video Views - stable/average
  'camp-6': generateTrend(120, 1.10, 'stable'),
  // camp-7: Traffic Blog - stable
  'camp-7': generateTrend(65, 1.50, 'stable'),
  // camp-8: Engagement - underperformer, paused and declining
  'camp-8': generateTrend(87, 0.40, 'down'),
};

// ----- Ad Sets -----

const adsetSparklines: Record<string, SparklineDataPoint[]> = {
  // camp-1 adsets
  'adset-1-1': generateTrend(345, 4.24, 'up'),      // Broad Women - high performer
  'adset-1-2': generateTrend(230, 3.68, 'stable'),   // Lookalike Purchase
  'adset-1-3': generateTrend(115, 3.80, 'stable'),   // Retargeting Website

  // camp-2 adsets
  'adset-2-1': generateTrend(306, 1.60, 'stable'),   // Interest Wellness

  // camp-3 adsets
  'adset-3-1': generateTrend(159, 4.40, 'up'),       // Skincare Enthusiasts
  'adset-3-2': generateTrend(106, 3.40, 'paused'),   // Lookalike Email - paused

  // camp-4 adsets
  'adset-4-1': generateTrend(765, 5.00, 'paused'),   // BFCM All - paused
  'adset-4-2': generateTrend(510, 4.41, 'paused'),   // BFCM Past Purchasers - paused

  // camp-5 adsets
  'adset-5-1': generateTrend(263, 5.02, 'up'),       // Website Visitors 7d - strong
  'adset-5-2': generateTrend(200, 4.51, 'up'),       // Add to Cart No Purchase

  // camp-6 adsets
  'adset-6-1': generateTrend(120, 1.10, 'stable'),   // Broad All Audiences

  // camp-7 adsets
  'adset-7-1': generateTrend(65, 1.50, 'stable'),    // Interest Wellness Blogs

  // camp-8 adsets
  'adset-8-1': generateTrend(87, 0.40, 'down'),      // Page Likes Broad - declining
};

// ----- Ads -----

const adSparklines: Record<string, SparklineDataPoint[]> = {
  // camp-1 ads
  'ad-1-1-1': generateTrend(178, 4.69, 'up'),        // Lifestyle Shot - top ad
  'ad-1-1-2': generateTrend(167, 3.76, 'stable'),    // UGC Testimonial
  'ad-1-2-1': generateTrend(123, 3.76, 'stable'),    // Carousel Best Sellers
  'ad-1-2-2': generateTrend(107, 3.60, 'paused'),    // Before/After - paused
  'ad-1-3-1': generateTrend(115, 3.80, 'stable'),    // Dynamic Product Ad

  // camp-2 ads
  'ad-2-1-1': generateTrend(178, 1.69, 'stable'),    // Brand Story Video
  'ad-2-1-2': generateTrend(128, 1.48, 'down'),      // New Collection Static

  // camp-3 ads
  'ad-3-1-1': generateTrend(159, 4.40, 'up'),        // Free Sample Serum
  'ad-3-2-1': generateTrend(106, 3.40, 'paused'),    // Free Sample Video - paused

  // camp-4 ads
  'ad-4-1-1': generateTrend(459, 5.35, 'paused'),    // BFCM 50% Off Countdown
  'ad-4-1-2': generateTrend(305, 4.48, 'paused'),    // BFCM Gift Bundle
  'ad-4-2-1': generateTrend(510, 4.41, 'paused'),    // VIP Early Access

  // camp-5 ads
  'ad-5-1-1': generateTrend(263, 5.02, 'up'),        // Social Proof Reviews
  'ad-5-2-1': generateTrend(200, 4.51, 'up'),        // Abandoned Cart 10% Off

  // camp-6 ads
  'ad-6-1-1': generateTrend(120, 1.10, 'stable'),    // Product Demo Full Routine

  // camp-7 ads
  'ad-7-1-1': generateTrend(65, 1.50, 'stable'),     // Blog Post Top 5

  // camp-8 ads
  'ad-8-1-1': generateTrend(87, 0.40, 'down'),       // Community Poll - declining
};

export const mockSparklineData: Record<string, SparklineDataPoint[]> = {
  ...campSparklines,
  ...adsetSparklines,
  ...adSparklines,
};

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function getSparklineData(entityId: string): SparklineDataPoint[] {
  // Return pre-defined data if available
  if (mockSparklineData[entityId]) {
    return mockSparklineData[entityId];
  }

  // For real (unknown) entity IDs, generate deterministic data based on ID hash
  const hash = simpleHash(entityId);
  const patterns: Array<'up' | 'down' | 'stable' | 'paused'> = ['up', 'down', 'stable', 'stable'];
  const pattern = patterns[hash % patterns.length];
  const baseSpend = 50 + (hash % 500);
  const baseRoas = 0.5 + ((hash % 40) / 10); // 0.5 to 4.5

  return generateTrend(baseSpend, baseRoas, pattern);
}
