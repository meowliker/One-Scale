'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FormulaInput } from './FormulaInput';
import { allMetrics } from '@/data/metricDefinitions';
import type { FormulaToken, CustomMetric } from '@/types/dashboard';

export interface CustomMetricBuilderProps {
  isOpen: boolean;
  onClose: () => void;
}

const operators = ['+', '-', '*', '/', '(', ')'];

const resultFormats: { value: CustomMetric['resultFormat']; label: string }[] = [
  { value: 'currency', label: 'Currency' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'number', label: 'Number' },
];

export function CustomMetricBuilder({ isOpen, onClose }: CustomMetricBuilderProps) {
  const [name, setName] = useState('');
  const [tokens, setTokens] = useState<FormulaToken[]>([]);
  const [resultFormat, setResultFormat] = useState<CustomMetric['resultFormat']>('number');
  const [numberInput, setNumberInput] = useState('');

  const handleAddToken = (token: FormulaToken) => {
    setTokens((prev) => [...prev, token]);
  };

  const handleRemoveToken = (index: number) => {
    setTokens((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddNumber = () => {
    const num = parseFloat(numberInput);
    if (!isNaN(num)) {
      handleAddToken({ type: 'number', value: numberInput });
      setNumberInput('');
    }
  };

  const formulaPreview = tokens.map((t) => t.value).join(' ');

  const handleSave = () => {
    if (!name.trim() || tokens.length === 0) return;

    const customMetric: CustomMetric = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      formula: tokens,
      resultFormat,
    };

    // For now, log the custom metric (integration with store can be added later)
    console.log('Custom metric created:', customMetric);

    // Reset and close
    setName('');
    setTokens([]);
    setResultFormat('number');
    setNumberInput('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Custom Metric" size="lg">
      <div className="space-y-6">
        {/* Name Input */}
        <div>
          <label htmlFor="metric-name" className="mb-1 block text-sm font-medium text-gray-700">
            Metric Name
          </label>
          <input
            id="metric-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Blended ROAS"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Formula Area */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Formula</label>
          <FormulaInput
            tokens={tokens}
            onAddToken={handleAddToken}
            onRemoveToken={handleRemoveToken}
          />
        </div>

        {/* Metric Pills */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Metrics
          </label>
          <div className="flex flex-wrap gap-2">
            {allMetrics.map((metric) => (
              <button
                key={metric.key}
                onClick={() => handleAddToken({ type: 'metric', value: metric.shortLabel })}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                {metric.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Operator Buttons */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Operators
          </label>
          <div className="flex gap-2">
            {operators.map((op) => (
              <button
                key={op}
                onClick={() => handleAddToken({ type: 'operator', value: op })}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        {/* Number Input */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Number
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              placeholder="Enter a number"
              className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddNumber();
              }}
            />
            <button
              onClick={handleAddNumber}
              disabled={!numberInput || isNaN(parseFloat(numberInput))}
              className="rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Result Format */}
        <div>
          <label htmlFor="result-format" className="mb-1 block text-sm font-medium text-gray-700">
            Result Format
          </label>
          <select
            id="result-format"
            value={resultFormat}
            onChange={(e) => setResultFormat(e.target.value as CustomMetric['resultFormat'])}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {resultFormats.map((fmt) => (
              <option key={fmt.value} value={fmt.value}>
                {fmt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {tokens.length > 0 && (
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Preview
            </span>
            <p className="mt-1 font-mono text-sm text-gray-800">{formulaPreview}</p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end border-t border-gray-100 pt-4">
          <button
            onClick={handleSave}
            disabled={!name.trim() || tokens.length === 0}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Custom Metric
          </button>
        </div>
      </div>
    </Modal>
  );
}
