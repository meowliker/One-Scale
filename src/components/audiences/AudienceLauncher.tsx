'use client';

import { useState } from 'react';
import { Rocket, DollarSign, ToggleLeft, ToggleRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface FunnelAudience {
  id: string;
  name: string;
  size: string;
  enabled: boolean;
}

interface FunnelStage {
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
  budgetPct: number;
  audiences: FunnelAudience[];
}

const initialStages: FunnelStage[] = [
  {
    title: 'Acquisition',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    budgetPct: 50,
    audiences: [
      { id: 'acq-1', name: 'Interest - Fashion Enthusiasts', size: '5.2M', enabled: true },
      { id: 'acq-2', name: 'Lookalike 1% - Purchasers', size: '1.9M', enabled: true },
      { id: 'acq-3', name: 'Broad Targeting - US', size: '120M', enabled: false },
      { id: 'acq-4', name: 'Lookalike 2% - ATC', size: '3.2M', enabled: true },
    ],
  },
  {
    title: 'Retargeting',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    budgetPct: 30,
    audiences: [
      { id: 'ret-1', name: 'Website Visitors 30d', size: '82K', enabled: true },
      { id: 'ret-2', name: 'Product Viewers 14d', size: '45K', enabled: true },
      { id: 'ret-3', name: 'Cart Abandoners 7d', size: '12K', enabled: true },
      { id: 'ret-4', name: 'IG/FB Engagers 30d', size: '156K', enabled: false },
    ],
  },
  {
    title: 'Retention',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    budgetPct: 20,
    audiences: [
      { id: 'rtn-1', name: 'Past Purchasers 90d', size: '28K', enabled: true },
      { id: 'rtn-2', name: 'Repeat Buyers', size: '8.5K', enabled: true },
      { id: 'rtn-3', name: 'Email Subscribers', size: '65K', enabled: false },
      { id: 'rtn-4', name: 'High LTV Customers', size: '4.2K', enabled: true },
    ],
  },
];

interface AudienceLauncherProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AudienceLauncher({ isOpen, onClose }: AudienceLauncherProps) {
  const [stages, setStages] = useState(initialStages);
  const [totalBudget, setTotalBudget] = useState(1000);

  const toggleAudience = (stageIndex: number, audienceId: string) => {
    setStages((prev) =>
      prev.map((stage, si) =>
        si === stageIndex
          ? {
              ...stage,
              audiences: stage.audiences.map((a) =>
                a.id === audienceId ? { ...a, enabled: !a.enabled } : a
              ),
            }
          : stage
      )
    );
  };

  const updateBudget = (stageIndex: number, value: number) => {
    setStages((prev) =>
      prev.map((stage, si) =>
        si === stageIndex ? { ...stage, budgetPct: value } : stage
      )
    );
  };

  const handleDeploy = () => {
    const enabledCount = stages.reduce(
      (acc, s) => acc + s.audiences.filter((a) => a.enabled).length,
      0
    );
    toast.success(`Deployed ${enabledCount} audiences across full funnel`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Full-Funnel Audience Launcher
              </h2>
              <p className="text-xs text-gray-500">
                Configure and deploy audiences across all funnel stages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {/* Budget input */}
        <div className="border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              Daily Budget:
            </span>
            <input
              type="number"
              value={totalBudget}
              onChange={(e) => setTotalBudget(Number(e.target.value))}
              className="w-28 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Funnel columns */}
        <div className="grid grid-cols-3 gap-4 p-6">
          {stages.map((stage, stageIdx) => (
            <div
              key={stage.title}
              className={cn(
                'rounded-lg border p-4',
                stage.borderColor,
                stage.bgColor
              )}
            >
              <h3
                className={cn(
                  'mb-1 text-sm font-bold',
                  stage.color
                )}
              >
                {stage.title}
              </h3>

              {/* Budget allocation */}
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">Budget:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={stage.budgetPct}
                  onChange={(e) =>
                    updateBudget(stageIdx, Number(e.target.value))
                  }
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-300 accent-blue-600"
                />
                <span className="text-xs font-semibold text-gray-700">
                  {stage.budgetPct}%
                </span>
                <span className="text-xs text-gray-500">
                  (${((totalBudget * stage.budgetPct) / 100).toFixed(0)}/day)
                </span>
              </div>

              {/* Audiences */}
              <div className="space-y-2">
                {stage.audiences.map((aud) => (
                  <div
                    key={aud.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg border bg-white px-3 py-2',
                      aud.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-900">
                        {aud.name}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {aud.size} people
                      </p>
                    </div>
                    <button
                      onClick={() => toggleAudience(stageIdx, aud.id)}
                    >
                      {aud.enabled ? (
                        <ToggleRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <p className="text-xs text-gray-500">
            {stages.reduce(
              (acc, s) => acc + s.audiences.filter((a) => a.enabled).length,
              0
            )}{' '}
            audiences selected across{' '}
            {stages.filter((s) => s.audiences.some((a) => a.enabled)).length}{' '}
            stages
          </p>
          <button
            onClick={handleDeploy}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Rocket className="h-4 w-4" />
            Deploy Full Funnel
          </button>
        </div>
      </div>
    </div>
  );
}
