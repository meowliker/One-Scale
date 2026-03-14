'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Loader2, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Campaign } from '@/types/campaign';

type DuplicateOption = 'original' | 'existing' | 'new';

interface DuplicateAdSetModalProps {
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  storeId: string;
  accountId: string;
  campaigns: Campaign[];
  onClose: () => void;
  onSuccess: () => void;
}

export function DuplicateAdSetModal({
  adSetId,
  adSetName,
  campaignId,
  campaignName,
  storeId,
  accountId,
  campaigns,
  onClose,
  onSuccess,
}: DuplicateAdSetModalProps) {
  const [selectedOption, setSelectedOption] = useState<DuplicateOption>('original');
  const [numberOfCopies, setNumberOfCopies] = useState(1);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter campaigns for search
  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Set default new campaign name
  useEffect(() => {
    if (selectedOption === 'new' && !newCampaignName) {
      setNewCampaignName(`${campaignName} - Copy`);
    }
  }, [selectedOption, campaignName, newCampaignName]);

  const handleDuplicate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const requestBody: Record<string, unknown> = {
        storeId,
        objectId: adSetId,
        objectType: 'adset',
        numberOfCopies,
      };

      if (selectedOption === 'existing' && selectedCampaignId) {
        requestBody.targetCampaignId = selectedCampaignId;
      } else if (selectedOption === 'new' && newCampaignName) {
        requestBody.newCampaignName = newCampaignName;
        requestBody.accountId = accountId;
      }
      // For 'original', no extra params needed - it duplicates to the same campaign

      const response = await fetch('/api/meta/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to duplicate ad set');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate ad set');
    } finally {
      setIsLoading(false);
    }
  };

  const canDuplicate = () => {
    if (selectedOption === 'existing' && !selectedCampaignId) return false;
    if (selectedOption === 'new' && !newCampaignName.trim()) return false;
    return true;
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white dark:bg-surface-elevated shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Duplicate your ad set</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {numberOfCopies} {numberOfCopies === 1 ? 'copy' : 'copies'} of 1 ad set will be duplicated into 1 campaign
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Campaign selection options */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-3">
              Select a campaign for your ad set
            </p>
            <div className="space-y-2">
              {/* Original Campaign */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="duplicateOption"
                  checked={selectedOption === 'original'}
                  onChange={() => setSelectedOption('original')}
                  className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">Original campaign</p>
                  <p className="text-xs text-text-muted">Duplicate your ad set into the same campaign.</p>
                </div>
              </label>

              {/* Existing Campaign */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="duplicateOption"
                  checked={selectedOption === 'existing'}
                  onChange={() => setSelectedOption('existing')}
                  className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">Existing campaign</p>
                  <p className="text-xs text-text-muted">Duplicate your ad set into another campaign.</p>
                </div>
              </label>

              {/* Campaign search dropdown - shown when existing is selected */}
              {selectedOption === 'existing' && (
                <div className="ml-7 mt-2">
                  {/* Show selected campaign or search */}
                  {selectedCampaignId && !showCampaignDropdown ? (
                    <button
                      type="button"
                      onClick={() => setShowCampaignDropdown(true)}
                      className="w-full flex items-center gap-2 rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm text-text-primary hover:border-primary transition-colors text-left"
                    >
                      <Search className="h-4 w-4 text-text-muted shrink-0" />
                      <span className="truncate">{campaigns.find(c => c.id === selectedCampaignId)?.name}</span>
                    </button>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                        <input
                          type="text"
                          placeholder="Search campaigns..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full rounded-lg border border-border bg-white dark:bg-surface pl-10 pr-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                        {filteredCampaigns.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-text-muted">No campaigns found</p>
                        ) : (
                          filteredCampaigns.map((campaign) => (
                            <button
                              key={campaign.id}
                              type="button"
                              onClick={() => {
                                setSelectedCampaignId(campaign.id);
                                setShowCampaignDropdown(false);
                                setSearchQuery('');
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors ${
                                selectedCampaignId === campaign.id
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-text-primary'
                              }`}
                            >
                              {campaign.name}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* New Campaign */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="duplicateOption"
                  checked={selectedOption === 'new'}
                  onChange={() => setSelectedOption('new')}
                  className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">New campaign</p>
                  <p className="text-xs text-text-muted">Create a new campaign for your duplicated ad set.</p>
                </div>
              </label>

              {/* New campaign name input - shown when new is selected */}
              {selectedOption === 'new' && (
                <div className="ml-7 mt-2 space-y-3">
                  <input
                    type="text"
                    placeholder="Name your campaign"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="text-xs text-text-muted space-y-1">
                    <p><span className="font-medium text-text-secondary">Buying type:</span> Auction</p>
                    <p><span className="font-medium text-text-secondary">Objective:</span> Sales</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Number of copies */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Number of copies
            </label>
            <select
              value={numberOfCopies}
              onChange={(e) => setNumberOfCopies(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={isLoading || !canDuplicate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Duplicating...
              </>
            ) : (
              'Duplicate'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
