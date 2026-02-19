'use client';

import {
  FlaskConical,
  Trophy,
  PiggyBank,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  mockAutoTestConfig,
  mockAutoTestStats,
  mockAutoTestLog,
} from '@/data/mockAutoTestRules';
import { cn } from '@/lib/utils';
import { AutoTestConfigForm } from './AutoTestConfigForm';
import { AutoTestRules } from './AutoTestRules';
import { AutoTestActivityLog } from './AutoTestActivityLog';

// ---------------------------------------------------------------------------
// Stat Card (local to this dashboard)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'orange' | 'purple';
}

const statColorMap: Record<StatCardProps['color'], { iconBg: string }> = {
  blue: { iconBg: 'bg-blue-100 text-blue-600' },
  green: { iconBg: 'bg-green-100 text-green-600' },
  orange: { iconBg: 'bg-orange-100 text-orange-600' },
  purple: { iconBg: 'bg-purple-100 text-purple-600' },
};

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colors = statColorMap[color];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          colors.iconBg
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function TestingDashboard() {
  const stats = mockAutoTestStats;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Tests This Week"
          value={String(stats.testsThisWeek)}
          icon={FlaskConical}
          color="blue"
        />
        <StatCard
          label="Winners Found"
          value={String(stats.winnersFound)}
          icon={Trophy}
          color="green"
        />
        <StatCard
          label="Budget Saved"
          value={`$${stats.budgetSaved.toLocaleString()}`}
          icon={PiggyBank}
          color="orange"
        />
        <StatCard
          label="ROAS Improvement"
          value={`+${stats.roasImprovement}%`}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Auto-Test Rules (visual summary) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Active Rules</h2>
        <AutoTestRules config={mockAutoTestConfig} />
      </div>

      {/* Two-Column Layout: Config + Activity Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Configuration Form */}
        <div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Testing Configuration
            </h2>
            <AutoTestConfigForm initialConfig={mockAutoTestConfig} />
          </div>
        </div>

        {/* Right: Activity Log */}
        <div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Recent Activity
            </h2>
            <AutoTestActivityLog log={mockAutoTestLog} />
          </div>
        </div>
      </div>
    </div>
  );
}
