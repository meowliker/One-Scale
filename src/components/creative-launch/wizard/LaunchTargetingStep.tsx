'use client';

import { useState, useMemo } from 'react';
import { X, Plus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TargetingConfig {
  ageMin: number;
  ageMax: number;
  genders: number[];
  locations: string[];
  interests: Array<{ id: string; name: string }>;
}

interface Adset {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  dailyBudget: number | null;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[] };
    flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }> }>;
  };
}

interface LaunchTargetingStepProps {
  config: TargetingConfig;
  onConfigChange: (config: TargetingConfig) => void;
  selectedAdset?: Adset;
}

const SUGGESTED_INTERESTS = [
  { id: '6003139266461', name: 'E-commerce' },
  { id: '6003107902433', name: 'Online Shopping' },
  { id: '6003456182657', name: 'Fashion' },
  { id: '6003384829104', name: 'Technology' },
  { id: '6003139266461', name: 'Fitness' },
  { id: '6003139266461', name: 'Travel' },
  { id: '6003139266461', name: 'Food & Dining' },
  { id: '6003139266461', name: 'Beauty' },
  { id: '6003139266461', name: 'Home Decor' },
  { id: '6003139266461', name: 'Sports' },
  { id: '6003139266461', name: 'Gaming' },
  { id: '6003139266461', name: 'Music' },
];

const COMMON_LOCATIONS = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
];

export function LaunchTargetingStep({
  config,
  onConfigChange,
  selectedAdset,
}: LaunchTargetingStepProps) {
  const [locationInput, setLocationInput] = useState('');
  const [interestInput, setInterestInput] = useState('');

  // Calculate audience size indicator (simplified)
  const audienceSize = useMemo(() => {
    let size = 100;
    // Narrower age range = smaller audience
    const ageRange = config.ageMax - config.ageMin;
    size -= (65 - ageRange);
    // Specific genders = smaller audience
    if (config.genders.length === 1) size -= 30;
    // More locations = larger audience
    size += config.locations.length * 5;
    // More interests = smaller (more targeted) audience
    size -= config.interests.length * 3;
    return Math.max(10, Math.min(100, size));
  }, [config]);

  const addLocation = (code: string) => {
    if (!config.locations.includes(code)) {
      onConfigChange({ ...config, locations: [...config.locations, code] });
    }
    setLocationInput('');
  };

  const removeLocation = (code: string) => {
    onConfigChange({ ...config, locations: config.locations.filter(l => l !== code) });
  };

  const addInterest = (interest: { id: string; name: string }) => {
    if (!config.interests.find(i => i.id === interest.id)) {
      onConfigChange({ ...config, interests: [...config.interests, interest] });
    }
    setInterestInput('');
  };

  const removeInterest = (id: string) => {
    onConfigChange({ ...config, interests: config.interests.filter(i => i.id !== id) });
  };

  const toggleGender = (gender: number) => {
    if (config.genders.includes(gender)) {
      onConfigChange({ ...config, genders: config.genders.filter(g => g !== gender) });
    } else {
      onConfigChange({ ...config, genders: [...config.genders, gender] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Define Your Audience</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose who you want to see your ads. Auto-populated from your best performing audience.
        </p>
      </div>

      {/* Auto-populated notice */}
      {selectedAdset?.targeting && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Auto-populated from ad set</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Targeting settings copied from "{selectedAdset.name}". You can modify as needed.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Age Range */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Age Range</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Min Age</label>
                <input
                  type="number"
                  min={18}
                  max={65}
                  value={config.ageMin}
                  onChange={(e) => onConfigChange({ ...config, ageMin: parseInt(e.target.value) || 18 })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-slate-400 pt-5">-</span>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Max Age</label>
                <input
                  type="number"
                  min={18}
                  max={65}
                  value={config.ageMax}
                  onChange={(e) => onConfigChange({ ...config, ageMax: parseInt(e.target.value) || 65 })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, genders: [] })}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.genders.length === 0
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => toggleGender(1)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.genders.includes(1)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => toggleGender(2)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.genders.includes(2)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                Female
              </button>
            </div>
          </div>

          {/* Locations */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Locations</label>
            <input
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && locationInput.trim()) {
                  addLocation(locationInput.trim().toUpperCase());
                }
              }}
              placeholder="Type a location and press Enter"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {config.locations.map(loc => {
                const location = COMMON_LOCATIONS.find(l => l.code === loc);
                return (
                  <span
                    key={loc}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                  >
                    {location?.name || loc}
                    <button
                      type="button"
                      onClick={() => removeLocation(loc)}
                      className="hover:text-blue-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Interests */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Interests</label>
            <input
              type="text"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              placeholder="Type an interest and press Enter"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            
            {/* Selected Interests */}
            <div className="flex flex-wrap gap-2 mt-2">
              {config.interests.map(interest => (
                <span
                  key={interest.id}
                  className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700"
                >
                  {interest.name}
                  <button
                    type="button"
                    onClick={() => removeInterest(interest.id)}
                    className="hover:text-purple-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Suggested Interests */}
            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-2">Suggested interests:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_INTERESTS.filter(i => !config.interests.find(ci => ci.name === i.name))
                  .slice(0, 8)
                  .map(interest => (
                    <button
                      key={interest.name}
                      type="button"
                      onClick={() => addInterest(interest)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {interest.name}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Audience Size Indicator */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Estimated Audience Size</span>
              <span className="text-sm text-slate-500">
                {audienceSize < 40 ? 'Specific' : audienceSize > 70 ? 'Broad' : 'Balanced'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  audienceSize < 40
                    ? 'bg-amber-500'
                    : audienceSize > 70
                    ? 'bg-emerald-500'
                    : 'bg-blue-500'
                )}
                style={{ width: `${audienceSize}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-slate-400">Specific</span>
              <span className="text-xs text-slate-400">Broad</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
