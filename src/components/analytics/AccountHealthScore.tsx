'use client';

import { cn } from '@/lib/utils';

export interface AccountHealthScoreProps {
  metrics: Record<string, number>;
}

interface HealthCategory {
  name: string;
  score: number;
  color: string;
}

function computeHealthScores(metrics: Record<string, number>): { overall: number; categories: HealthCategory[] } {
  const roas = metrics.blendedRoas ?? 0;
  const ctr = metrics.blendedCtr ?? 0;
  const cpc = metrics.blendedCpc ?? 0;
  const cpm = metrics.blendedCpm ?? 0;
  const totalSpend = metrics.totalSpend ?? 0;
  const totalRevenue = metrics.totalRevenue ?? 0;

  // Spend Efficiency — based on ROAS (higher is better)
  // ROAS 1.0 = 40, ROAS 2.0 = 60, ROAS 3.0 = 75, ROAS 5.0+ = 95
  const spendEfficiency = Math.min(95, Math.max(20, Math.round(40 + (roas - 1) * 18)));

  // CTR Performance — based on CTR (higher is better)
  // CTR 0.5% = 40, CTR 1.0% = 55, CTR 2.0% = 75, CTR 3.0%+ = 90
  const ctrScore = Math.min(95, Math.max(20, Math.round(40 + ctr * 17)));

  // Cost Efficiency — based on CPC (lower is better)
  // CPC $5.0 = 40, CPC $2.0 = 60, CPC $0.50 = 90
  const costScore = cpc > 0 ? Math.min(95, Math.max(20, Math.round(100 - cpc * 12))) : 50;

  // Revenue Performance — ratio of revenue to spend
  const revenueRatio = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const revenueScore = Math.min(95, Math.max(20, Math.round(30 + revenueRatio * 15)));

  const categories: HealthCategory[] = [
    { name: 'Spend Efficiency', score: spendEfficiency, color: 'bg-blue-500' },
    { name: 'CTR Performance', score: ctrScore, color: 'bg-purple-500' },
    { name: 'Cost Efficiency', score: costScore, color: 'bg-amber-500' },
    { name: 'Revenue Performance', score: revenueScore, color: 'bg-emerald-500' },
  ];

  const overall = Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);

  return { overall, categories };
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Poor';
}

export function AccountHealthScore({ metrics }: AccountHealthScoreProps) {
  const { overall, categories } = computeHealthScores(metrics);
  const scoreColor = getScoreColor(overall);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (overall / 100) * circumference;

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-text-primary">Account Health</h3>
        <p className="mt-0.5 text-xs text-text-muted">Overall performance score</p>
      </div>
      <div className="flex flex-col items-center px-5 py-6">
        {/* SVG Gauge */}
        <div className="relative h-36 w-36">
          <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="#1e2235"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Score arc */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={scoreColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-text-primary">{overall}</span>
            <span className="text-xs font-medium" style={{ color: scoreColor }}>
              {getScoreLabel(overall)}
            </span>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="mt-5 w-full space-y-3">
          {categories.map((cat) => (
            <div key={cat.name}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">{cat.name}</span>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    cat.score >= 80
                      ? 'text-emerald-600'
                      : cat.score >= 60
                        ? 'text-amber-600'
                        : 'text-red-600'
                  )}
                >
                  {cat.score}/100
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className={cn('h-full rounded-full transition-all duration-700 ease-out', cat.color)}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
