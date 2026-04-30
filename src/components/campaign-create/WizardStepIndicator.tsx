'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardStepIndicatorProps {
  currentStep: number;
  steps: string[];
}

export function WizardStepIndicator({ currentStep, steps }: WizardStepIndicatorProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface-hover/70 px-4 py-4">
      <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isFuture = index > currentStep;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                  isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                  isCurrent && 'border-primary bg-primary text-white',
                  isFuture && 'border-border bg-surface text-text-muted'
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'mt-2 whitespace-nowrap text-xs',
                  isCompleted && 'font-medium text-emerald-700',
                  isCurrent && 'font-bold text-primary',
                  isFuture && 'text-text-muted'
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
                    ? 'bg-emerald-500'
                    : 'bg-border'
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
