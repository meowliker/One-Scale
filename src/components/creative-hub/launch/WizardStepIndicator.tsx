'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardStepIndicatorProps {
  currentStep: number;
  steps: string[];
}

export function WizardStepIndicator({ currentStep, steps }: WizardStepIndicatorProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isFuture = index > currentStep;

          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                    isCurrent && 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/25',
                    isFuture && 'border-slate-300 bg-white text-slate-500'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 whitespace-nowrap text-xs',
                    isCompleted && 'font-medium text-emerald-700',
                    isCurrent && 'font-bold text-blue-700',
                    isFuture && 'text-slate-500'
                  )}
                >
                  {step}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-3 mt-[-1.25rem] h-0.5 flex-1',
                    index < currentStep
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500'
                      : 'bg-slate-300'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
