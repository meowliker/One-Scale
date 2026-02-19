// ── Types ──────────────────────────────────────────────────────────────────────

export interface GeneratedCopy {
  id: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  framework: 'AIDA' | 'FOMO' | 'PAS' | 'BAB' | 'FAB';
  tone: 'professional' | 'casual' | 'urgent' | 'emotional' | 'humorous';
  score: number;
}

export interface WinningCopy {
  id: string;
  adName: string;
  primaryText: string;
  headline: string;
  ctr: number;
  roas: number;
  conversions: number;
  spend: number;
}

export interface CopyInsights {
  topPhrases: { phrase: string; frequency: number; avgCtr: number }[];
  avgWordCount: { primaryText: number; headline: number; description: number };
  topCTAs: { cta: string; conversionRate: number }[];
  toneAnalysis: { tone: string; percentage: number; performance: 'above' | 'below' | 'average' }[];
}

// ── Mock Generated Copy ────────────────────────────────────────────────────────

export const mockGeneratedCopy: GeneratedCopy[] = [
  {
    id: 'gc-1',
    primaryText:
      'Struggling with dull, tired skin? Our award-winning Vitamin C Serum has helped over 50,000 women reclaim their natural glow. Clinically proven to brighten skin tone in just 14 days, this lightweight formula absorbs instantly and works while you sleep. Try it risk-free with our 60-day money-back guarantee.',
    headline: 'Wake Up to Visibly Brighter Skin in 14 Days',
    description:
      'Dermatologist-recommended Vitamin C Serum with hyaluronic acid. Clinically tested. Free shipping on orders over $50.',
    cta: 'Shop Now',
    framework: 'AIDA',
    tone: 'professional',
    score: 92,
  },
  {
    id: 'gc-2',
    primaryText:
      'Only 127 left in stock. Over 50,000 women transformed their skin this month alone and we just sold out twice. Our best-selling Hydra-Glow Moisturizer is flying off the shelves for the third time this quarter. Once it is gone, the next restock is 6 weeks away. Do not miss your chance to see what the hype is about.',
    headline: 'Selling Out Fast - Get Yours Before They Are Gone',
    description:
      'The moisturizer that broke the internet. 50K+ happy customers. Limited stock remaining - order today for free express shipping.',
    cta: 'Grab Yours Now',
    framework: 'FOMO',
    tone: 'urgent',
    score: 87,
  },
  {
    id: 'gc-3',
    primaryText:
      'Tired of waking up to breakouts and uneven skin? We know the frustration of trying product after product with zero results. The problem is not your skin - it is the harsh chemicals stripping your natural moisture barrier. Our Clean Skin Reset Kit uses gentle, plant-based ingredients that work with your skin, not against it. Over 12,000 five-star reviews from real women who finally found something that works.',
    headline: 'Finally - Clear Skin Without the Harsh Chemicals',
    description:
      'Plant-based skincare that actually works. 12,000+ five-star reviews. Start your clear skin journey with our bestselling starter kit.',
    cta: 'Start Your Reset',
    framework: 'PAS',
    tone: 'emotional',
    score: 89,
  },
  {
    id: 'gc-4',
    primaryText:
      'Imagine waking up to glowing, radiant skin every morning without a 10-step routine. No more layering five different serums or spending 30 minutes on your skincare. Our All-in-One Radiance Cream replaces your serum, moisturizer, and SPF in a single step. Real women are cutting their routine in half and seeing better results than ever. Your mornings are about to get a whole lot easier.',
    headline: 'One Product. Zero Hassle. Radiant Skin Daily.',
    description:
      'Replace your entire routine with one powerful cream. Serum + moisturizer + SPF in a single step. Simplify your mornings today.',
    cta: 'Simplify My Routine',
    framework: 'BAB',
    tone: 'casual',
    score: 84,
  },
  {
    id: 'gc-5',
    primaryText:
      'Introducing our new Collagen Boost Peptide Serum, featuring a patented triple-peptide complex that stimulates natural collagen production 3x faster than retinol alone. The result? Visibly firmer, plumper skin in as little as 21 days. Backed by a double-blind clinical study with 94% of participants reporting improved skin elasticity. No irritation. No downtime. Just results.',
    headline: '94% Saw Firmer Skin in 21 Days - Clinically Proven',
    description:
      'Triple-peptide complex for visibly firmer skin. Clinically proven results in 21 days. Gentle enough for sensitive skin.',
    cta: 'See the Science',
    framework: 'FAB',
    tone: 'professional',
    score: 91,
  },
  {
    id: 'gc-6',
    primaryText:
      'Your cart is judging you. That Superfood Face Oil you have been eyeing? It is the same one that 8,000 customers rated 4.9 stars last month. The same one that sold out in 48 hours during our last restock. We just got a fresh batch in but honestly? At this rate, we give it about 3 days. Your skin called - it says stop overthinking it.',
    headline: 'Your Skin Literally Cannot Wait Any Longer',
    description:
      'The viral Superfood Face Oil is back in stock. 4.9 stars from 8,000+ reviews. Free shipping today. Your glow-up starts now.',
    cta: 'Add to Cart',
    framework: 'FOMO',
    tone: 'humorous',
    score: 78,
  },
  {
    id: 'gc-7',
    primaryText:
      'Every night you go to bed without a proper night serum, your skin misses out on its peak repair window. Overnight, your cells regenerate 8x faster than during the day. Our Midnight Recovery Elixir is designed to work in sync with your body clock, delivering retinol, bakuchiol, and squalane exactly when your skin needs it most. Wake up looking like you slept 10 hours even if you only got 6.',
    headline: 'Your Skin Repairs Itself at Night - Help It Do More',
    description:
      'Overnight repair serum with retinol and bakuchiol. Works while you sleep for visibly renewed skin by morning.',
    cta: 'Try Midnight Recovery',
    framework: 'PAS',
    tone: 'professional',
    score: 86,
  },
  {
    id: 'gc-8',
    primaryText:
      'Hey gorgeous! We get it - finding the right supplements feels like navigating a maze blindfolded. That is exactly why we created the Daily Glow Bundle. Three simple capsules a day packed with biotin, collagen peptides, and vitamin E. No weird ingredients you cannot pronounce. No confusing dosing schedules. Just pop, sip, glow. Over 25,000 women are already obsessed and honestly? We get it.',
    headline: 'Three Capsules a Day to Your Best Skin Ever',
    description:
      'The Daily Glow Bundle: biotin + collagen + vitamin E in three easy capsules. Join 25,000+ glowing women. Subscription saves 20%.',
    cta: 'Join the Glow Club',
    framework: 'BAB',
    tone: 'casual',
    score: 81,
  },
];

// ── Mock Winning Copy ──────────────────────────────────────────────────────────

export const mockWinningCopy: WinningCopy[] = [
  {
    id: 'wc-1',
    adName: 'Summer Glow - UGC Testimonial V2',
    primaryText:
      'I was skeptical, but after 2 weeks my dark spots started fading. Now my friends keep asking what I changed. This Vitamin C Serum is the real deal.',
    headline: 'See Why 50,000 Women Switched Their Serum',
    ctr: 3.42,
    roas: 5.80,
    conversions: 412,
    spend: 3200,
  },
  {
    id: 'wc-2',
    adName: 'Morning Routine - Influencer Collab',
    primaryText:
      'My morning routine used to take 30 minutes. Now it takes 5. This All-in-One Radiance Cream replaced four products and my skin has never looked better.',
    headline: 'The 5-Minute Morning Routine That Changed Everything',
    ctr: 3.15,
    roas: 5.20,
    conversions: 341,
    spend: 4100,
  },
  {
    id: 'wc-3',
    adName: 'Before & After - Real Results',
    primaryText:
      'Same woman. Same camera. Same lighting. The only difference? 28 days with our Clean Skin Reset Kit. No filters. No edits. Just real, visible results.',
    headline: '28 Days. Zero Filters. Real Results.',
    ctr: 2.98,
    roas: 4.90,
    conversions: 287,
    spend: 2800,
  },
  {
    id: 'wc-4',
    adName: 'Limited Drop - Midnight Collection',
    primaryText:
      'We made 5,000 units. 3,800 are already gone. Our Midnight Recovery Elixir sold out twice and we are not making any more after this batch. If you have been waiting, this is your sign.',
    headline: 'Last Chance - Only 1,200 Left in Stock',
    ctr: 2.87,
    roas: 4.71,
    conversions: 256,
    spend: 2450,
  },
  {
    id: 'wc-5',
    adName: 'Dermatologist Series - Trust',
    primaryText:
      'As a board-certified dermatologist, I rarely recommend direct-to-consumer brands. But after reviewing the clinical data on this peptide serum, I had to make an exception. The results speak for themselves.',
    headline: 'Board-Certified Dermatologist Approved',
    ctr: 2.61,
    roas: 4.35,
    conversions: 198,
    spend: 1950,
  },
  {
    id: 'wc-6',
    adName: 'Subscribe & Save - Retention',
    primaryText:
      'Join 25,000 women who never run out of their favorite skincare. Subscribe to the Daily Glow Bundle and save 20% on every order. Plus, free shipping forever. Cancel anytime - but trust us, you will not want to.',
    headline: 'Save 20% + Free Shipping Forever',
    ctr: 2.45,
    roas: 4.10,
    conversions: 178,
    spend: 1600,
  },
];

// ── Mock Copy Insights ─────────────────────────────────────────────────────────

export const mockCopyInsights: CopyInsights = {
  topPhrases: [
    { phrase: 'clinically proven', frequency: 18, avgCtr: 2.95 },
    { phrase: 'real results', frequency: 15, avgCtr: 3.12 },
    { phrase: 'free shipping', frequency: 24, avgCtr: 2.41 },
    { phrase: 'limited stock', frequency: 12, avgCtr: 3.28 },
    { phrase: 'money-back guarantee', frequency: 9, avgCtr: 2.78 },
    { phrase: '5-star reviews', frequency: 14, avgCtr: 2.65 },
    { phrase: 'dermatologist recommended', frequency: 8, avgCtr: 2.89 },
    { phrase: 'sold out twice', frequency: 6, avgCtr: 3.45 },
  ],
  avgWordCount: {
    primaryText: 52,
    headline: 8,
    description: 18,
  },
  topCTAs: [
    { cta: 'Shop Now', conversionRate: 4.2 },
    { cta: 'Get Yours Now', conversionRate: 3.8 },
    { cta: 'Try It Risk-Free', conversionRate: 3.6 },
    { cta: 'Start Your Journey', conversionRate: 3.1 },
    { cta: 'Learn More', conversionRate: 2.4 },
    { cta: 'Subscribe & Save', conversionRate: 2.9 },
  ],
  toneAnalysis: [
    { tone: 'Professional', percentage: 35, performance: 'above' },
    { tone: 'Casual', percentage: 25, performance: 'average' },
    { tone: 'Urgent', percentage: 18, performance: 'above' },
    { tone: 'Emotional', percentage: 14, performance: 'below' },
    { tone: 'Humorous', percentage: 8, performance: 'average' },
  ],
};
