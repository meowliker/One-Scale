/**
 * Adaptive Intelligence System — Barrel Export
 *
 * Import from '@/lib/intelligence' for all intelligence modules.
 */

// Types
export type {
  StoreType,
  ProductClassificationType,
  ClassificationMethod,
  ProductIntelligenceRow,
  FeeStructureRow,
  StoreIntelligenceRow,
  CogsSuggestionRow,
  CurrencyConfigRow,
  CampaignMappingRow,
  PnLWarning,
  ProductPnL,
  PnLResult,
  InitStatus,
  CogsSuggestionReason,
  CogsSuggestionStatus,
  ClassificationSignals,
  SignalStackResult,
  SignalStackMethod,
  ProductOrderPattern,
} from './types';

// Store Intelligence (orchestrator)
export {
  initializeStore,
  getStoreIntelligence,
  refreshHealthScore,
} from './storeIntelligence';

// Product Intelligence
export {
  analyzeAndSaveProducts,
  getProductIntelligence,
  setManualClassification,
} from './productIntelligence';

// Fee Intelligence
export {
  detectAndSaveFeeRates,
  getStoreFeeStructures,
} from './feeIntelligence';

// Campaign Intelligence
export {
  mapAndSaveCampaigns,
  setManualCampaignMapping,
} from './campaignIntelligence';

// COGS Intelligence
export {
  suggestAndSaveCogs,
  getCogsCoverage,
} from './cogsIntelligence';

// Currency Intelligence
export {
  detectAndSaveCurrencies,
  getExchangeRate,
  convertCurrency,
  getCurrencyConfig,
} from './currencyIntelligence';

// Store Type Detection
export { detectStoreType } from './storeTypeDetector';

// Order Pattern Analysis
export { analyzeOrderPatterns, partitionByDataSufficiency } from './orderPatternAnalyzer';

// Signal Stack Classifier
export { computeSignals, classifyProduct, computeMedianPrice } from './signalStackClassifier';

// Classification Router (main orchestrator)
export { classifyAllProducts } from './classificationRouter';
