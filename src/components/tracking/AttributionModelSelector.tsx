'use client';

import { useState } from 'react';
import type { AttributionModel } from '@/types/tracking';
import { cn } from '@/lib/utils';
import { Check, MousePointer, Crosshair, Activity, Clock, Globe } from 'lucide-react';

interface AttributionModelSelectorProps {
  currentModel: AttributionModel;
}

interface ModelOption {
  id: AttributionModel;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  diagram: string;
}

const models: ModelOption[] = [
  {
    id: 'first_click',
    name: 'First Click',
    description: 'Credits the first touchpoint',
    icon: MousePointer,
    diagram: '[100%] --- --- ---',
  },
  {
    id: 'last_click',
    name: 'Last Click',
    description: 'Credits the last touchpoint before conversion',
    icon: Crosshair,
    diagram: '--- --- --- [100%]',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Equal credit to all touchpoints',
    icon: Activity,
    diagram: '[25%] [25%] [25%] [25%]',
  },
  {
    id: 'time_decay',
    name: 'Time Decay',
    description: 'More credit to recent touchpoints',
    icon: Clock,
    diagram: '[10%] [20%] [30%] [40%]',
  },
  {
    id: 'position_based',
    name: 'Position Based',
    description: '40% first, 20% middle, 40% last',
    icon: Globe,
    diagram: '[40%] [10%] [10%] [40%]',
  },
];

type WindowOption = '1day' | '7day' | '28day';

const windowOptions: { id: WindowOption; label: string }[] = [
  { id: '1day', label: '1 Day' },
  { id: '7day', label: '7 Day' },
  { id: '28day', label: '28 Day' },
];

export function AttributionModelSelector({
  currentModel,
}: AttributionModelSelectorProps) {
  const [selectedModel, setSelectedModel] =
    useState<AttributionModel>(currentModel);
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>('7day');

  return (
    <div className="space-y-6">
      {/* Model grid */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Attribution Model
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {models.map((model) => {
            const isSelected = selectedModel === model.id;
            const Icon = model.icon;

            return (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={cn(
                  'relative rounded-lg border-2 p-4 text-left transition-all',
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                )}
              >
                {isSelected && (
                  <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}

                <div className="mb-2 flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      isSelected ? 'bg-blue-100' : 'bg-gray-100'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'text-blue-600' : 'text-gray-500'
                      )}
                    />
                  </div>
                  <h4
                    className={cn(
                      'text-sm font-semibold',
                      isSelected ? 'text-blue-900' : 'text-gray-900'
                    )}
                  >
                    {model.name}
                  </h4>
                </div>

                <p
                  className={cn(
                    'mb-3 text-xs',
                    isSelected ? 'text-blue-700' : 'text-gray-500'
                  )}
                >
                  {model.description}
                </p>

                {/* Simple visual diagram */}
                <div
                  className={cn(
                    'rounded-md px-2.5 py-1.5 font-mono text-xs',
                    isSelected
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-50 text-gray-400'
                  )}
                >
                  {model.diagram}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Attribution window selector */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Attribution Window
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          How far back to look for touchpoints when attributing a conversion.
        </p>
        <div className="flex gap-3">
          {windowOptions.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all',
                selectedWindow === option.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
            >
              <input
                type="radio"
                name="attribution-window"
                value={option.id}
                checked={selectedWindow === option.id}
                onChange={() => setSelectedWindow(option.id)}
                className="sr-only"
              />
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border-2',
                  selectedWindow === option.id
                    ? 'border-blue-500'
                    : 'border-gray-300'
                )}
              >
                {selectedWindow === option.id && (
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                )}
              </div>
              {option.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
