import type { FeeResult } from './feeIntelligence';

export interface CogsResult {
  amount: number;
  source: 'user_configured' | 'category_average' | 'ai_suggested' | 'not_configured';
  confidence: number;
}

export interface DataQualityWarning {
  type: 'fees' | 'cogs' | 'chargebacks' | 'classification';
  severity: 'high' | 'medium' | 'low';
  message: string;
  actionUrl?: string;
  estimatedRevenueImpact: number;
}

export interface DataQuality {
  score: number; // 0-100
  fees: 'actual' | 'estimated' | 'missing';
  cogs: 'complete' | 'partial' | 'missing';
  chargebacks: 'live' | 'cached' | 'missing';
  classification: 'complete' | 'partial' | 'initializing';
  warnings: DataQualityWarning[];
}

export function computeDataQuality(params: {
  feeResults: FeeResult[];
  cogsResults: CogsResult[];
  products: Array<{ revenue: number; classificationConfidence?: number; needsReview?: boolean }>;
  chargebackSyncAge: number | null; // ms since last sync, null if never
  totalRevenue: number;
}): DataQuality {
  const { feeResults, cogsResults, products, chargebackSyncAge, totalRevenue } = params;
  const warnings: DataQualityWarning[] = [];

  // Fee quality -- weighted by confidence
  let feeScore = 1;
  if (feeResults.length > 0) {
    const totalFeeConfidence = feeResults.reduce((s, f) => s + f.confidence, 0);
    feeScore = totalFeeConfidence / feeResults.length;

    const noDataCount = feeResults.filter(f => f.source === 'no_data').length;
    if (noDataCount > 0) {
      warnings.push({
        type: 'fees',
        severity: noDataCount > feeResults.length * 0.5 ? 'high' : 'medium',
        message: `${noDataCount} payment gateway(s) have no fee data configured`,
        actionUrl: '/dashboard/settings/pnl',
        estimatedRevenueImpact: totalRevenue * 0.03 * (noDataCount / Math.max(feeResults.length, 1)),
      });
    }
  }

  // COGS quality -- revenue-weighted
  let cogsScore = 1;
  if (cogsResults.length > 0 && products.length > 0) {
    let weightedScore = 0;
    let totalWeight = 0;

    for (let i = 0; i < cogsResults.length; i++) {
      const revenueShare = totalRevenue > 0 && products[i]
        ? products[i].revenue / totalRevenue
        : 1 / cogsResults.length;
      const productScore = cogsResults[i].source === 'not_configured' ? 0 : cogsResults[i].confidence;
      weightedScore += productScore * revenueShare;
      totalWeight += revenueShare;
    }
    cogsScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    const unconfigured = cogsResults.filter(c => c.source === 'not_configured');
    if (unconfigured.length > 0) {
      const unconfiguredRevShare = unconfigured.length / Math.max(cogsResults.length, 1);
      warnings.push({
        type: 'cogs',
        severity: unconfiguredRevShare > 0.5 ? 'high' : 'medium',
        message: `${unconfigured.length} of ${cogsResults.length} products have no COGS configured`,
        actionUrl: '/dashboard/settings/pnl',
        estimatedRevenueImpact: totalRevenue * unconfiguredRevShare * 0.3,
      });
    }
  }

  // Chargeback quality -- based on sync freshness
  let chargebackScore = 1;
  if (chargebackSyncAge === null) {
    chargebackScore = 0;
    warnings.push({
      type: 'chargebacks',
      severity: 'low',
      message: 'Chargeback data has never been synced',
      estimatedRevenueImpact: totalRevenue * 0.01,
    });
  } else {
    const ageHours = chargebackSyncAge / 3600000;
    if (ageHours > 48) {
      chargebackScore = Math.max(0.2, 1 - (ageHours / 168)); // Decays over a week
      warnings.push({
        type: 'chargebacks',
        severity: ageHours > 168 ? 'medium' : 'low',
        message: `Chargeback data is ${Math.round(ageHours)}h old`,
        estimatedRevenueImpact: totalRevenue * 0.005,
      });
    }
  }

  // Classification quality -- avg confidence and pending count
  let classScore = 1;
  if (products.length > 0) {
    const avgConfidence = products.reduce((s, p) => s + (p.classificationConfidence || 0), 0) / products.length;
    const needsReviewCount = products.filter(p => p.needsReview).length;
    classScore = (avgConfidence / 100) * (1 - needsReviewCount / products.length * 0.5);

    if (needsReviewCount > 0) {
      warnings.push({
        type: 'classification',
        severity: needsReviewCount > products.length * 0.3 ? 'medium' : 'low',
        message: `${needsReviewCount} products need classification review`,
        actionUrl: '/dashboard/pnl',
        estimatedRevenueImpact: 0,
      });
    }
  }

  // Weighted score
  const weights = { fees: 0.25, cogs: 0.30, chargebacks: 0.15, classification: 0.30 };
  const overall = Math.round(
    (feeScore * weights.fees + cogsScore * weights.cogs +
     chargebackScore * weights.chargebacks + classScore * weights.classification) * 100
  );

  // Sort warnings by revenue impact
  warnings.sort((a, b) => b.estimatedRevenueImpact - a.estimatedRevenueImpact);

  return {
    score: Math.min(100, Math.max(0, overall)),
    fees: feeScore > 0.8 ? 'actual' : feeScore > 0.4 ? 'estimated' : 'missing',
    cogs: cogsScore > 0.8 ? 'complete' : cogsScore > 0.3 ? 'partial' : 'missing',
    chargebacks: chargebackScore > 0.8 ? 'live' : chargebackScore > 0.3 ? 'cached' : 'missing',
    classification: classScore > 0.7 ? 'complete' : classScore > 0.3 ? 'partial' : 'initializing',
    warnings,
  };
}
