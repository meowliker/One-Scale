'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  dailyBudget: number | null;
  spend30d: number;
  roas30d: number;
}

interface Adset {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  dailyBudget: number | null;
}

interface CampaignConfig {
  mode: 'existing' | 'new';
  campaignId: string;
  campaignName: string;
  adsetMode: 'existing' | 'new' | 'isolated';
  adsetId: string;
  adsetName: string;
  destinationUrl: string;
}

interface LaunchCampaignStepProps {
  config: CampaignConfig;
  onConfigChange: (config: CampaignConfig) => void;
  campaigns: Campaign[];
  adsets: Adset[];
}

function SearchableDropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
  renderOption,
}: {
  label: string;
  placeholder: string;
  options: Array<{ id: string; name: string; [key: string]: unknown }>;
  value: string;
  onChange: (id: string) => void;
  renderOption?: (option: { id: string; name: string; [key: string]: unknown }) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.name.toLowerCase().includes(lower));
  }, [options, search]);

  const selected = options.find(o => o.id === value);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
          {selected?.name || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results</p>
            ) : (
              filtered.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50',
                    option.id === value && 'bg-blue-50 text-blue-700'
                  )}
                >
                  {renderOption ? renderOption(option) : option.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LaunchCampaignStep({
  config,
  onConfigChange,
  campaigns,
  adsets,
}: LaunchCampaignStepProps) {
  const filteredAdsets = useMemo(() => {
    if (!config.campaignId) return [];
    return adsets.filter(a => a.campaignId === config.campaignId);
  }, [adsets, config.campaignId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Where to Test</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose an existing campaign or create a new one for your creatives.
        </p>
      </div>

      {/* Campaign Mode Toggle */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Campaign</label>
        <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50 w-fit">
          <button
            type="button"
            onClick={() => onConfigChange({ ...config, mode: 'existing' })}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              config.mode === 'existing'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Existing Campaign
          </button>
          <button
            type="button"
            onClick={() => onConfigChange({ ...config, mode: 'new' })}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              config.mode === 'new'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            New Campaign
          </button>
        </div>
      </div>

      {/* Campaign Selection or Name */}
      {config.mode === 'existing' ? (
        <SearchableDropdown
          label="Select Campaign"
          placeholder="Select a campaign..."
          options={campaigns.map(c => ({
            id: c.id,
            name: c.name,
            status: c.status,
            spend: c.spend30d,
            roas: c.roas30d,
          }))}
          value={config.campaignId}
          onChange={(id) => onConfigChange({ ...config, campaignId: id, adsetId: '' })}
          renderOption={(option) => (
            <div className="flex items-center justify-between">
              <span className="truncate">{option.name}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">${(option.spend as number)?.toFixed(0) || '0'}</span>
                <span className={cn(
                  'font-medium',
                  (option.roas as number) >= 1 ? 'text-green-600' : 'text-amber-600'
                )}>
                  {(option.roas as number)?.toFixed(2) || '0.00'}x
                </span>
              </div>
            </div>
          )}
        />
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign Name</label>
          <input
            type="text"
            value={config.campaignName}
            onChange={(e) => onConfigChange({ ...config, campaignName: e.target.value })}
            placeholder="Enter campaign name..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Ad Set Mode Toggle */}
      {(config.mode === 'existing' && config.campaignId) && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ad Set</label>
            <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50 w-fit">
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, adsetMode: 'existing' })}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  config.adsetMode === 'existing'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Existing
              </button>
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, adsetMode: 'new' })}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  config.adsetMode === 'new'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                New
              </button>
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, adsetMode: 'isolated' })}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  config.adsetMode === 'isolated'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Isolated
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {config.adsetMode === 'isolated' 
                ? 'Each creative will be in its own ad set for isolated testing'
                : config.adsetMode === 'new'
                ? 'Create a new ad set for all selected creatives'
                : 'Add creatives to an existing ad set'}
            </p>
          </div>

          {/* Ad Set Selection or Name */}
          {config.adsetMode === 'existing' ? (
            <SearchableDropdown
              label="Select Ad Set"
              placeholder={filteredAdsets.length === 0 ? 'No ad sets in this campaign' : 'Select an ad set...'}
              options={filteredAdsets.map(a => ({
                id: a.id,
                name: a.name,
                status: a.status,
                budget: a.dailyBudget,
              }))}
              value={config.adsetId}
              onChange={(id) => onConfigChange({ ...config, adsetId: id })}
              renderOption={(option) => (
                <div className="flex items-center justify-between">
                  <span className="truncate">{option.name}</span>
                  {typeof option.budget === 'number' && option.budget > 0 && (
                    <span className="text-xs text-slate-500">${option.budget}/day</span>
                  )}
                </div>
              )}
            />
          ) : config.adsetMode === 'new' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Set Name</label>
              <input
                type="text"
                value={config.adsetName}
                onChange={(e) => onConfigChange({ ...config, adsetName: e.target.value })}
                placeholder="Enter ad set name..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ) : null}
        </>
      )}

    </div>
  );
}
