'use client';

import { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const defaultOptions = [
  'Facebook/Instagram Ad',
  'Google Search',
  'TikTok',
  'Friend/Family',
  'Email',
  'Influencer',
  'Other',
];

export function SurveyBuilder() {
  const [options, setOptions] = useState<string[]>(defaultOptions);
  const [newOption, setNewOption] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...options];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOptions(next);
  };

  const moveDown = (index: number) => {
    if (index === options.length - 1) return;
    const next = [...options];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOptions(next);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const addOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      toast.error('This option already exists');
      return;
    }
    setOptions([...options, trimmed]);
    setNewOption('');
    toast.success('Option added');
  };

  const handleSave = () => {
    toast.success('Survey configuration saved');
  };

  return (
    <div className="space-y-6">
      {/* Enable/Disable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Post-Purchase Survey
          </h3>
          <p className="text-xs text-gray-500">
            Ask customers &ldquo;How did you hear about us?&rdquo; after checkout
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className="flex items-center gap-2"
        >
          {enabled ? (
            <ToggleRight className="h-8 w-8 text-blue-600" />
          ) : (
            <ToggleLeft className="h-8 w-8 text-gray-400" />
          )}
          <span
            className={cn(
              'text-sm font-medium',
              enabled ? 'text-blue-600' : 'text-gray-400'
            )}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </button>
      </div>

      {/* Answer Options */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Answer Options
        </h3>
        <div className="space-y-2">
          {options.map((option, index) => (
            <div
              key={`${option}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
              <span className="min-w-0 flex-1 text-sm text-gray-700">
                {option}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === options.length - 1}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeOption(index)}
                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add custom option */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOption()}
            placeholder="Add custom option..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addOption}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save Configuration
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Eye className="h-4 w-4" />
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-1 text-sm font-semibold text-gray-400">
            SURVEY PREVIEW
          </h3>
          <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
            <h4 className="mb-1 text-lg font-bold text-gray-900">
              Thank you for your order!
            </h4>
            <p className="mb-4 text-sm text-gray-600">
              How did you first hear about us?
            </p>
            <div className="space-y-2">
              {options.map((option, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  {option}
                </label>
              ))}
            </div>
            <button className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white">
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
