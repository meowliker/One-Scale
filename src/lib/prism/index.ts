/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 *
 * Central configuration and constants. Import thresholds from here
 * instead of hardcoding values across files.
 */

export const PRISM = {
  version: '1.0.0',

  // Classification thresholds
  classification: {
    minOrdersForBehavioral: 30,   // Below this uses bootstrap
    minOrdersForBootstrap: 5,     // Below this uses title hints only
    minOrdersForSignalStack: 10,  // Per-product minimum for signal stack
    lowConfidenceThreshold: 50,   // Below this → needs_review = true
  },

  // Attribution
  attribution: {
    pixelCoverageThreshold: 0.40, // Below this falls back to campaign matching
    minAttributedOrders: 3,       // Minimum pixel-attributed orders
    sessionWindowDays: 7,
  },

  // Data windows
  dataWindows: {
    behavioralAnalysisDays: 60,   // orderPatternAnalyzer lookback
    recentOrdersDays: 30,         // Track 1 backfill window
    metaBackfillMonths: 37,       // Meta Ads historical depth
  },

  // Rate limits
  rateLimits: {
    metaCallsPerHour: 180,
    shopifyBatchSize: 250,
  },
} as const;

export type PrismConfig = typeof PRISM;

// Re-export PRISM modules
export { normalize, normalizeBatch, syncExchangeRates } from './currencyNormalizer';
export { buildStoreFinancialProfile, getOrBuildFinancialProfile } from './financialProfiler';
export { detectFinancialAnomalies } from './anomalyDetector';
export type { NormalizedAmount } from './currencyNormalizer';
export type { StoreFinancialProfile } from './financialProfiler';
export type { Anomaly } from './anomalyDetector';
