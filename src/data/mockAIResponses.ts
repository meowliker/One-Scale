import type { AIRecommendation, AIDailyAudit, AIInsight } from '@/types/ai';

// ── Chat Response Templates ───────────────────────────────────────────
// Keyed by keyword fragments; the service layer picks the first match.

export const mockChatResponses: Record<string, string> = {
  'roas drop': `Here's what I'm seeing on ROAS:

**"Summer Sale - Broad" campaign** dropped from 3.8x to 2.1x ROAS over the past 72 hours. The root cause is a 34% increase in CPM on the "Women 25-34" ad set — Meta's auction got more competitive heading into the weekend.

**Breakdown:**
- CPM went from $12.40 to $16.60 (+34%)
- CTR held steady at 1.8%, so the creative isn't the issue
- CPA jumped from $18.50 to $27.20

**What I'd do right now:**
1. Shift $30/day from "Summer Sale - Broad" to "Retargeting 7-day" which is still running at 5.1x ROAS
2. Kill the "Static Banner v2" ad — it's dragging the whole ad set down with a 0.9% CTR
3. Launch the new UGC video you have staged — UGC is outperforming static by 2.3x across the account right now

This isn't a panic situation — it's a normal CPM fluctuation. We just need to reallocate spend to protect margins while the auction cools off.`,

  'creative': `Let me pull up the creative performance data.

**Top performers right now:**
1. **UGC Testimonial - Sarah** — 4.2x ROAS, $8.40 CPA, 2.4% CTR. This is your best asset. Scale it.
2. **Product Demo 15s** — 3.8x ROAS, running strong for 14 days with no fatigue signals
3. **Carousel - Before/After** — 3.1x ROAS, great for retargeting audiences

**What to test next:**
- **Hook variations:** Your top UGC opens with "I was skeptical but..." — test 3 new hooks on the same body: "My friend told me about...", "After trying everything...", "Week 2 update..."
- **Format test:** Take your best-performing static image and turn it into a 6-second motion graphic. I'm seeing motion outperform static by 40% in this vertical.
- **Founder story ad:** You don't have any founder content. Brands in your space running founder ads are seeing 20-30% lower CPAs on cold traffic.

**Creative fatigue alert:** "Lifestyle Shot v1" has been running for 28 days and CTR dropped 45% from its peak. Replace it this week.`,

  'budget': `Here's my budget reallocation plan based on the last 7 days of data:

**Current daily budget:** $450/day across 6 campaigns

**Recommended changes:**

| Campaign | Current | Recommended | Reason |
|---|---|---|---|
| Broad Women 25-45 | $50 | $100 (+$50) | ROAS 4.24x, still in learning phase, room to scale |
| Summer Sale - Conversions | $120 | $120 (hold) | Steady at 3.1x, don't touch it |
| Retargeting 7-day | $80 | $60 (-$20) | Frequency hitting 3.2x, reduce to avoid fatigue |
| Brand Awareness | $80 | $40 (-$40) | Not driving measurable conversions, cut it |
| Interest - Yoga Fans | $70 | $30 (-$40) | CPA at $42, well above $25 target |
| US Scale - Lookalike | $50 | $100 (+$50) | 3.6x ROAS and only 15% of budget used, massive headroom |

**Net result:** Same $450/day spend but projected ROAS improvement from 2.8x to 3.4x based on historical performance of the winning campaigns.

I'd make these changes gradually — 20% budget increases per day to avoid resetting the learning phase.`,

  'scale': `Here's my scaling strategy for the account:

**Phase 1 — Vertical Scaling (This Week):**
- Increase "Broad Women 25-45" budget by 20% daily until you hit $200/day. This campaign has shown consistent 4.24x ROAS with no fatigue signals.
- Push "US Scale - Lookalike" from $50 to $150/day over 5 days. The 1% lookalike from purchasers is crushing it.

**Phase 2 — Horizontal Scaling (Next Week):**
- Duplicate your top ad sets into new campaigns targeting CA, UK, and AU. Your product ships internationally and these markets have 30-40% lower CPMs.
- Launch a new "Broad Men 25-45" campaign using your top 3 creatives. You've been leaving male audiences completely untapped.

**Phase 3 — Creative Scaling (Ongoing):**
- You need 3-5 new creatives per week to sustain scale. Right now you're running 8 ads total — that's not enough.
- Prioritize UGC and video. Your video ads have 2.3x higher ROAS than static.

**Guardrails:**
- Never increase any campaign more than 20% per day
- Kill anything under 2x ROAS after 3 days and $50+ spend
- Watch frequency — anything over 2.5x on prospecting needs fresh creative
- Set account-level daily cap at $600 until ROAS stabilizes above 3x`,

  'yesterday': `Here's your daily performance summary for yesterday:

**Overall Numbers:**
- Total Spend: $447.23
- Total Revenue: $1,487.60
- Overall ROAS: 3.33x (up from 3.1x day before)
- Total Purchases: 34
- Average CPA: $13.15

**Winners:**
- "Broad Women 25-45" — $98 spend, $415 revenue (4.24x ROAS). Best performing campaign.
- "US Scale - Lookalike 1%" — $48 spend, $173 revenue (3.60x ROAS). Still scaling well.

**Losers:**
- "Interest - Yoga Fans" — $68 spend, $41 revenue (0.60x ROAS). This needs to be paused immediately.
- "Brand Awareness" — $78 spend, $0 attributed revenue. I know this is top of funnel, but we need to cut it and redirect to what's converting.

**Key Changes I Noticed:**
- CPMs dropped 8% across the account — competition is easing
- Your new UGC Testimonial ad got 12 purchases in its first day — this is a winner
- Retargeting frequency hit 3.2x — we're burning out the audience

**My #1 recommendation:** Pause "Interest - Yoga Fans" and move that $70/day to "Broad Women 25-45". That one move alone could add $200/day in revenue.`,

  'fatigue': `Let me run a creative fatigue analysis across your account.

**Fatigued Creatives (Action Required):**

1. **"Lifestyle Shot v1"** — Running 28 days
   - CTR dropped from 2.1% to 1.15% (-45%)
   - CPM up 22% while performance declined
   - Verdict: **REPLACE IMMEDIATELY**

2. **"Static Banner v2"** — Running 21 days
   - CTR dropped from 1.6% to 0.9% (-44%)
   - Frequency at 4.1x in retargeting
   - Verdict: **REPLACE THIS WEEK**

3. **"Carousel - Product Features"** — Running 18 days
   - CTR down 15% from peak — early fatigue signals
   - Verdict: **MONITOR — you have 5-7 days before it's critical**

**Healthy Creatives:**
- "UGC Testimonial - Sarah" (7 days, stable CTR)
- "Product Demo 15s" (14 days, no decline)
- "Carousel - Before/After" (10 days, stable)

**Replacement Strategy:**
- For "Lifestyle Shot v1": Launch that new UGC video you have in drafts. UGC is your top format right now.
- For "Static Banner v2": Create a motion version of your best-performing static. Adding subtle motion can extend creative life by 2-3x.
- Build a creative pipeline — you need at least 2 new ads per week to sustain current spend levels without fatigue issues.`,

  'audience': `Here's my audience optimization analysis:

**Top Performing Audiences (Keep & Scale):**
1. **Broad Women 25-45** — 4.24x ROAS, $11.80 CPA. Your best audience. Has room to scale 2-3x.
2. **1% Lookalike - Purchasers** — 3.60x ROAS, $13.40 CPA. The most efficient lookalike.
3. **Retargeting - Add to Cart 7d** — 5.10x ROAS, $8.20 CPA. Small but mighty.

**Underperforming Audiences (Fix or Kill):**
1. **Interest - Yoga Fans** — 0.60x ROAS. Kill it. This interest targeting isn't working for your product.
2. **Retargeting - All Visitors 30d** — 1.8x ROAS, frequency 3.2x. The window is too broad. Narrow to 7-day visitors only.
3. **5% Lookalike - Email List** — 1.4x ROAS. Too broad. Test a 1% seed instead.

**New Audiences to Test:**
- **Broad Men 25-45** — You're not targeting men at all. Even if only 20% of your customers are male, that's untapped volume.
- **1% Lookalike from Top 25% AOV customers** — Quality seed = quality lookalike
- **Engaged Instagram followers (180 days)** — Warm but not retargeting. Low CPAs in this vertical.
- **Stacked interest: Yoga + Wellness + Self-care** — More specific than broad yoga, might convert better.

The biggest opportunity is scaling "Broad Women 25-45" — it's your most efficient campaign and you're only spending $50/day on it.`,

  'competitor': `Here's what I'm seeing in the competitive landscape:

**Auction Trends:**
- CPMs in your category (wellness/beauty DTC) are up 12% month-over-month
- Expect another 15-20% increase heading into Q4 — plan your budgets accordingly
- Weekday CPMs are 20% lower than weekends — consider dayparting

**What Top Competitors Are Doing:**
- The brands winning in this space are running 60% video, 30% UGC, 10% static. You're at 40% video — room to improve.
- Competitor ad libraries show heavy investment in "founder story" style content. You're not running any of this.
- Several competitors are testing long-form (60s+) educational content. This format is emerging for higher AOV products.

**Competitive Advantages You Have:**
- Your UGC content is outperforming industry benchmarks by 30%
- Your retargeting ROAS (5.1x) is well above the 3.5x category average
- Your product page CVR (4.2%) gives you more room on CPA than most competitors

**Recommendations:**
1. Invest in founder/brand story content — this is a gap in your creative mix
2. Shift 20% more budget to video formats
3. Start building out TikTok as a channel — CPMs are 40% lower than Meta right now and your UGC style translates perfectly
4. Lock in your top 3 UGC creators on retainer before Q4 when creator costs spike 30-50%`,

  'help': `I'm your AI media buyer assistant. Here's what I can help you with:

**Performance Analysis:**
- "Why did ROAS drop?" — I'll diagnose performance issues
- "What happened yesterday?" — Daily performance summary
- "How's [campaign name] doing?" — Campaign-level deep dive

**Budget & Scaling:**
- "Budget recommendations" — Optimized budget reallocation plan
- "Scale strategy" — How to profitably increase spend
- "Should I increase budget on [campaign]?" — Specific guidance

**Creative Strategy:**
- "Which creatives to test?" — Next creative tests to run
- "Creative fatigue check" — Identify fatigued ads that need replacement
- "What ad format works best?" — Format performance analysis

**Audience Optimization:**
- "Audience recommendations" — Which audiences to scale, test, or kill
- "Who should I target?" — New audience opportunities

**Competitive Intelligence:**
- "Competitor analysis" — What's happening in your competitive landscape
- "CPM trends" — Auction cost trends and forecasts

**Daily Operations:**
- "Daily audit" — Full morning briefing
- "Top 3 priorities" — What to focus on today

Just ask me anything about your ad account — I'll give you specific, actionable recommendations with real numbers.`,

  'priorities': `Here are your top 3 priorities for today, ranked by revenue impact:

**#1 — Pause "Interest - Yoga Fans" immediately**
- This ad set burned $68 yesterday with only $41 in revenue (0.60x ROAS)
- It's been underwater for 5 consecutive days
- Moving this budget to "Broad Women 25-45" could generate an extra $200/day
- **Estimated daily revenue impact: +$250**

**#2 — Replace "Lifestyle Shot v1" creative**
- CTR has dropped 45% over the last 2 weeks
- It's your most-spent creative and it's dragging down campaign performance
- Swap in the new UGC video — your UGC content is running 2.3x higher ROAS
- **Estimated daily revenue impact: +$120**

**#3 — Scale "Broad Women 25-45" budget from $50 to $60**
- This campaign is running at 4.24x ROAS with no fatigue signals
- A 20% increase is safe and won't reset the learning phase
- Keep scaling 20% daily until you see ROAS drop below 3.5x
- **Estimated daily revenue impact: +$40**

Total potential daily revenue improvement: **+$410/day** if you execute all three today.`,

  'cpa': `Let me break down CPA across your account:

**CPA by Campaign (Last 7 Days):**
1. Retargeting - Add to Cart 7d: **$8.20** (excellent)
2. Broad Women 25-45: **$11.80** (strong)
3. US Scale - Lookalike 1%: **$13.40** (good)
4. Summer Sale - Conversions: **$16.10** (acceptable)
5. Brand Awareness: **No conversions** (problematic)
6. Interest - Yoga Fans: **$42.00** (way over target)

**Your target CPA should be $25 max** based on your $65 AOV and 40% margin. That gives you $26 in gross profit — anything above $25 CPA eats into your margin.

**Actions to Lower CPA:**
- Kill everything above $30 CPA that's had 3+ days and $50+ spend
- Your retargeting audiences have the lowest CPA — make sure they're not budget-capped
- Broad targeting with good creative is beating interest targeting 3-to-1 on CPA. Lean into broad.`,

  'default': `I've analyzed your account data. Here's what stands out:

Your overall account ROAS is 3.33x with $447 daily spend. That's solid, but there's room for improvement. Your best campaign ("Broad Women 25-45") is doing 4.24x ROAS but only getting $50/day — it deserves more budget. Meanwhile, "Interest - Yoga Fans" is burning cash at 0.60x ROAS.

Want me to dive deeper into any of these areas?
- Budget optimization
- Creative performance
- Audience analysis
- Scaling strategy
- Daily performance review

Just ask and I'll give you specific, actionable recommendations.`,
};

// ── Recommendations ───────────────────────────────────────────────────

export const mockRecommendations: AIRecommendation[] = [
  {
    id: 'rec-1',
    type: 'scale',
    title: 'Scale "Broad Women 25-45" Campaign',
    description:
      'This campaign has maintained 4.24x ROAS over the past 14 days with no fatigue signals. Current daily budget of $50 is under-spending relative to performance. Recommend gradual 20% daily increases.',
    impact: '+$200/day estimated revenue increase',
    priority: 'high',
    confidence: 92,
    entityName: 'Broad Women 25-45',
    entityType: 'campaign',
    suggestedAction: 'Increase daily budget from $50 to $100',
    metrics: { roas: 4.24, cpa: 11.8, ctr: 2.1 },
    createdAt: '2024-01-15T08:00:00Z',
    isApplied: false,
  },
  {
    id: 'rec-2',
    type: 'pause',
    title: 'Pause "Interest - Yoga Fans" Ad Set',
    description:
      'This ad set has been below ROAS target for 5 consecutive days. CPA of $42 is 68% above the $25 target. Interest-based targeting is underperforming broad targeting by 3x in this account.',
    impact: 'Save $70/day in wasted spend',
    priority: 'high',
    confidence: 95,
    entityName: 'Interest - Yoga Fans',
    entityType: 'adset',
    suggestedAction: 'Pause ad set and reallocate budget to top performers',
    metrics: { roas: 0.6, cpa: 42, ctr: 0.8 },
    createdAt: '2024-01-15T08:00:00Z',
    isApplied: false,
  },
  {
    id: 'rec-3',
    type: 'test',
    title: 'Test New UGC Video in "Summer Sale" Campaign',
    description:
      'UGC video content is outperforming static images by 2.3x ROAS in this account. The staged UGC testimonial video matches the style of your current top performer. Launch as a new ad in the best-performing ad set.',
    impact: 'Potential 30-40% CPA improvement over current static ads',
    priority: 'high',
    confidence: 78,
    entityName: 'Summer Sale - Conversions',
    entityType: 'campaign',
    suggestedAction: 'Launch UGC testimonial video ad in top ad set',
    metrics: { estimatedCpa: 14, currentCpa: 22 },
    createdAt: '2024-01-15T08:15:00Z',
    isApplied: false,
  },
  {
    id: 'rec-4',
    type: 'budget',
    title: 'Reduce "Retargeting 7-day" Budget',
    description:
      'Frequency has reached 3.2x — audience is seeing ads too often, leading to fatigue and negative sentiment. Reduce budget to lower frequency back to the 2.0-2.5x sweet spot while maintaining strong ROAS.',
    impact: 'Prevent audience burnout, save $20/day',
    priority: 'medium',
    confidence: 85,
    entityName: 'Retargeting 7-day',
    entityType: 'campaign',
    suggestedAction: 'Reduce daily budget from $80 to $60',
    metrics: { frequency: 3.2, roas: 5.1, targetFrequency: 2.5 },
    createdAt: '2024-01-15T08:30:00Z',
    isApplied: false,
  },
  {
    id: 'rec-5',
    type: 'audience',
    title: 'Launch Lookalike from Top Purchasers',
    description:
      'Your 1% lookalike from all purchasers is performing at 3.6x ROAS. A 1% lookalike seeded from top 25% AOV customers should be even more effective, targeting higher-value prospects.',
    impact: 'Unlock new high-value audience segment',
    priority: 'medium',
    confidence: 72,
    entityName: 'US Scale - Lookalike',
    entityType: 'campaign',
    suggestedAction: 'Create 1% lookalike from top 25% AOV purchasers',
    metrics: { currentLalRoas: 3.6, estimatedRoas: 4.0 },
    createdAt: '2024-01-15T09:00:00Z',
    isApplied: false,
  },
  {
    id: 'rec-6',
    type: 'budget',
    title: 'Reallocate "Brand Awareness" Budget to Conversions',
    description:
      'Brand Awareness campaign has spent $2,340 over the past 30 days with zero attributed conversions. While brand campaigns have value, at your current spend level you need every dollar driving measurable results.',
    impact: 'Redirect $40/day to revenue-generating campaigns',
    priority: 'medium',
    confidence: 88,
    entityName: 'Brand Awareness',
    entityType: 'campaign',
    suggestedAction: 'Reduce from $80/day to $40/day, move $40 to conversion campaigns',
    metrics: { spend30d: 2340, conversions30d: 0 },
    createdAt: '2024-01-15T09:15:00Z',
    isApplied: false,
  },
  {
    id: 'rec-7',
    type: 'creative',
    title: 'A/B Test Headline Variations on Top Ad',
    description:
      'Your "UGC Testimonial - Sarah" ad is the top performer. Testing 3 headline variations could unlock further performance. Keep the same video, test different opening hooks and primary text.',
    impact: 'Potential 10-20% CTR improvement',
    priority: 'low',
    confidence: 65,
    entityName: 'UGC Testimonial - Sarah',
    entityType: 'ad',
    suggestedAction: 'Create 3 headline variants of top performing ad',
    metrics: { currentCtr: 2.4, currentRoas: 4.2 },
    createdAt: '2024-01-15T09:30:00Z',
    isApplied: false,
  },
  {
    id: 'rec-8',
    type: 'audience',
    title: 'Expand "US Scale" to CA and UK Markets',
    description:
      'Your product ships internationally and the "US Scale" campaign creative translates well across English-speaking markets. CA and UK have 30-40% lower CPMs which means cheaper customer acquisition.',
    impact: 'Access 40% more addressable market at lower CPMs',
    priority: 'low',
    confidence: 60,
    entityName: 'US Scale - Lookalike',
    entityType: 'campaign',
    suggestedAction: 'Duplicate top ad sets targeting Canada and United Kingdom',
    metrics: { usCpm: 16.6, estimatedCaCpm: 11.5, estimatedUkCpm: 10.2 },
    createdAt: '2024-01-15T10:00:00Z',
    isApplied: false,
  },
];

// ── Daily Audit ───────────────────────────────────────────────────────

export const mockDailyAudit: AIDailyAudit = {
  date: '2024-01-14',
  totalSpend: 447.23,
  totalRevenue: 1487.6,
  overallROAS: 3.33,
  keyChanges: [
    'ROAS improved from 3.1x to 3.33x — best day this week',
    'CPMs dropped 8% across the account — less auction competition',
    'New UGC Testimonial ad generated 12 purchases on Day 1 — early winner signal',
    'Retargeting frequency hit 3.2x — audience burnout risk increasing',
    '"Interest - Yoga Fans" continues to underperform at 0.60x ROAS (Day 5 below target)',
    'Total purchases: 34 (up 15% from the day before)',
  ],
  topRecommendations: [
    mockRecommendations[0],
    mockRecommendations[1],
    mockRecommendations[2],
  ],
  insights: [],
};

// ── Insights ──────────────────────────────────────────────────────────

export const mockInsights: AIInsight[] = [
  {
    id: 'ins-1',
    title: 'UGC Content Outperforming Static by 2.3x',
    summary:
      'Across all campaigns, UGC video ads are achieving 2.3x higher ROAS than static images. Consider shifting creative production budget towards UGC content to maintain this advantage.',
    category: 'creative',
    severity: 'positive',
    timestamp: '2024-01-15T08:00:00Z',
  },
  {
    id: 'ins-2',
    title: 'Retargeting Audience Approaching Saturation',
    summary:
      'Retargeting frequency has steadily increased from 2.1x to 3.2x over the past 10 days. At this rate, expect diminishing returns within a week. Reduce budget or expand the retargeting window.',
    category: 'audience',
    severity: 'warning',
    timestamp: '2024-01-15T08:15:00Z',
  },
  {
    id: 'ins-3',
    title: 'CPMs Trending Down This Week',
    summary:
      'Average CPMs dropped 8% week-over-week from $15.20 to $13.98. This is likely a post-holiday normalization. Take advantage of cheaper traffic to test new audiences while costs are low.',
    category: 'trend',
    severity: 'positive',
    timestamp: '2024-01-15T08:30:00Z',
  },
  {
    id: 'ins-4',
    title: 'Interest Targeting Underperforming Broad',
    summary:
      'Interest-based ad sets are averaging 1.4x ROAS while broad targeting averages 3.8x. Meta\'s algorithm is doing a better job finding customers with broad targeting plus strong creative signals.',
    category: 'audience',
    severity: 'warning',
    timestamp: '2024-01-15T09:00:00Z',
  },
  {
    id: 'ins-5',
    title: '"Yoga Fans" Ad Set Critically Underperforming',
    summary:
      'The "Interest - Yoga Fans" ad set has been below 1x ROAS for 5 consecutive days with total losses of $340. Immediate action required to stop budget waste.',
    category: 'performance',
    severity: 'critical',
    timestamp: '2024-01-15T09:15:00Z',
  },
  {
    id: 'ins-6',
    title: 'Weekend vs Weekday Performance Gap',
    summary:
      'Your campaigns perform 25% better on weekdays (3.8x ROAS) vs weekends (3.0x ROAS). Consider implementing dayparting to reduce weekend spend by 20% and reallocate to Monday-Friday.',
    category: 'budget',
    severity: 'info',
    timestamp: '2024-01-15T09:30:00Z',
  },
];

// Back-fill the daily audit with its insights
mockDailyAudit.insights = mockInsights.slice(0, 3);
