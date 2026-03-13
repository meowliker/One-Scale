'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Campaign, AdSet } from '@/types/campaign';

type CampaignOption = 'original' | 'existing' | 'new';
type AdSetOption = 'existing' | 'new';

interface DuplicateAdModalProps {
  adId: string;
  adName: string;
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

export function DuplicateAdModal({
  adId,
  adName,
  adSetId,
  adSetName,
  campaignId,
  campaignName,
  storeId,
  accountId,
  campaigns,
  onClose,
  onSuccess,
}: DuplicateAdModalProps) {
  const [selectedCampaignOption, setSelectedCampaignOption] = useState<CampaignOption>('original');
  const [selectedAdSetOption, setSelectedAdSetOption] = useState<AdSetOption>('existing');
  const [numberOfCopies, setNumberOfCopies] = useState(1);
  
  // For existing campaign selection
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [campaignSearchQuery, setCampaignSearchQuery] = useState('');
  
  // For existing ad set selection
  const [selectedAdSetId, setSelectedAdSetId] = useState<string>('');
  const [adSetSearchQuery, setAdSetSearchQuery] = useState('');
  
  // For new campaign/adset names
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newAdSetName, setNewAdSetName] = useState('');
  
  // Dropdown visibility states
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(true);
  const [showAdSetDropdown, setShowAdSetDropdown] = useState(true);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter campaigns for search
  const filteredCampaigns = useMemo(() => 
    campaigns.filter((c) =>
      c.name.toLowerCase().includes(campaignSearchQuery.toLowerCase())
    ),
    [campaigns, campaignSearchQuery]
  );

  // Get ad sets for selected campaign
  const selectedCampaign = useMemo(() => {
    if (selectedCampaignOption === 'original') {
      return campaigns.find(c => c.id === campaignId);
    } else if (selectedCampaignOption === 'existing' && selectedCampaignId) {
      return campaigns.find(c => c.id === selectedCampaignId);
    }
    return null;
  }, [selectedCampaignOption, selectedCampaignId, campaignId, campaigns]);

  const availableAdSets = useMemo(() => {
    if (!selectedCampaign) return [];
    return selectedCampaign.adSets || [];
  }, [selectedCampaign]);

  const filteredAdSets = useMemo(() =>
    availableAdSets.filter((as) =>
      as.name.toLowerCase().includes(adSetSearchQuery.toLowerCase())
    ),
    [availableAdSets, adSetSearchQuery]
  );

  // Set default names
  useEffect(() => {
    if (selectedCampaignOption === 'new' && !newCampaignName) {
      setNewCampaignName(`${campaignName} - Copy`);
    }
  }, [selectedCampaignOption, campaignName, newCampaignName]);

  useEffect(() => {
    if (selectedAdSetOption === 'new' && !newAdSetName) {
      setNewAdSetName(`${adSetName} - Copy`);
    }
  }, [selectedAdSetOption, adSetName, newAdSetName]);

  // Reset ad set selection when campaign option changes
  useEffect(() => {
    setSelectedAdSetId('');
    setSelectedAdSetOption('existing');
    setNewAdSetName('');
  }, [selectedCampaignOption, selectedCampaignId]);

  const handleDuplicate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const requestBody: Record<string, unknown> = {
        storeId,
        objectId: adId,
        objectType: 'ad',
        numberOfCopies,
      };

      // Determine target ad set
      if (selectedCampaignOption === 'original') {
        if (selectedAdSetOption === 'existing' && selectedAdSetId) {
          requestBody.targetAdSetId = selectedAdSetId;
        } else if (selectedAdSetOption === 'new' && newAdSetName) {
          requestBody.newAdSetName = newAdSetName;
          requestBody.targetCampaignId = campaignId;
        }
        // If no selection, duplicate to same ad set (default behavior)
      } else if (selectedCampaignOption === 'existing' && selectedCampaignId) {
        if (selectedAdSetOption === 'existing' && selectedAdSetId) {
          requestBody.targetAdSetId = selectedAdSetId;
        } else if (selectedAdSetOption === 'new' && newAdSetName) {
          requestBody.newAdSetName = newAdSetName;
          requestBody.targetCampaignId = selectedCampaignId;
        }
      } else if (selectedCampaignOption === 'new' && newCampaignName) {
        requestBody.newCampaignName = newCampaignName;
        requestBody.newAdSetName = newAdSetName || `${adSetName} - Copy`;
        requestBody.accountId = accountId;
      }

      const response = await fetch('/api/meta/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to duplicate ad');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate ad');
    } finally {
      setIsLoading(false);
    }
  };

  const canDuplicate = () => {
    if (selectedCampaignOption === 'existing' && !selectedCampaignId) return false;
    if (selectedCampaignOption === 'new' && !newCampaignName.trim()) return false;
    if (selectedCampaignOption !== 'new') {
      if (selectedAdSetOption === 'existing' && !selectedAdSetId && selectedCampaignOption !== 'original') return false;
      if (selectedAdSetOption === 'new' && !newAdSetName.trim()) return false;
    }
    return true;
  };

  // Only show ad set section for existing campaign (not original - it duplicates to same ad set)
  const showAdSetSection = selectedCampaignOption === 'existing' && selectedCampaignId;

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
            <h2 className="text-lg font-semibold text-text-primary">Duplicate your ad</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {numberOfCopies} {numberOfCopies === 1 ? 'copy' : 'copies'} of 1 ad will be duplicated into 1 ad set and 1 campaign
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
              Select a campaign for your ad
            </p>
            <div className="space-y-2">
              {/* Original Campaign */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="campaignOption"
                  checked={selectedCampaignOption === 'original'}
                  onChange={() => setSelectedCampaignOption('original')}
                  className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">Original campaign</p>
                  <p className="text-xs text-text-muted">Duplicate your ad into the same campaign.</p>
                </div>
              </label>

              {/* Existing Campaign */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="campaignOption"
                  checked={selectedCampaignOption === 'existing'}
                  onChange={() => setSelectedCampaignOption('existing')}
                  className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">Existing campaign</p>
                  <p className="text-xs text-text-muted">Duplicate your ad into another campaign.</p>
                </div>
              </label>

              {/* Campaign search dropdown */}
              {selectedCampaignOption === 'existing' && (
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
                          value={campaignSearchQuery}
                          onChange={(e) => setCampaignSearchQuery(e.target.value)}
                          className="w-full rounded-lg border border-border bg-white dark:bg-surface pl-10 pr-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-border">
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
                                setCampaignSearchQuery('');
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
                  name="campaignOption"
                  checked={selectedCampaignOption === 'new'}
                  onChange={() => setSelectedCampaignOption('new')}
                  className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">New campaign</p>
                  <p className="text-xs text-text-muted">Create a new campaign for your duplicated ad.</p>
                </div>
              </label>

              {/* New campaign name input */}
              {selectedCampaignOption === 'new' && (
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

          {/* Ad Set selection - only show when not creating new campaign */}
          {showAdSetSection && (
            <div className="border-t border-border pt-5">
              <p className="text-sm font-medium text-text-primary mb-3">
                Select an ad set for your ad
              </p>
              <div className="space-y-2">
                {/* Existing Ad Set */}
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="adSetOption"
                    checked={selectedAdSetOption === 'existing'}
                    onChange={() => setSelectedAdSetOption('existing')}
                    className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">Existing ad set</p>
                    <p className="text-xs text-text-muted">Duplicate your ad into a pre-existing ad set.</p>
                  </div>
                </label>

                {/* Ad set search dropdown */}
                {selectedAdSetOption === 'existing' && (
                  <div className="ml-7 mt-2">
                    {/* Show selected ad set or search */}
                    {selectedAdSetId && !showAdSetDropdown ? (
                      <button
                        type="button"
                        onClick={() => setShowAdSetDropdown(true)}
                        className="w-full flex items-center gap-2 rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm text-text-primary hover:border-primary transition-colors text-left"
                      >
                        <Search className="h-4 w-4 text-text-muted shrink-0" />
                        <span className="truncate">{availableAdSets.find(as => as.id === selectedAdSetId)?.name}</span>
                      </button>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                          <input
                            type="text"
                            placeholder="Search ad sets..."
                            value={adSetSearchQuery}
                            onChange={(e) => setAdSetSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-border bg-white dark:bg-surface pl-10 pr-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-border">
                          {filteredAdSets.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-text-muted">
                              {availableAdSets.length === 0 ? 'No ad sets in this campaign' : 'No ad sets found'}
                            </p>
                          ) : (
                            filteredAdSets.map((adSet) => (
                              <button
                                key={adSet.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAdSetId(adSet.id);
                                  setShowAdSetDropdown(false);
                                  setAdSetSearchQuery('');
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors ${
                                  selectedAdSetId === adSet.id
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-text-primary'
                                }`}
                              >
                                {adSet.name}
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* New Ad Set */}
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface-hover/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="adSetOption"
                    checked={selectedAdSetOption === 'new'}
                    onChange={() => setSelectedAdSetOption('new')}
                    className="mt-0.5 h-4 w-4 text-primary border-border focus:ring-primary"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">New ad set</p>
                    <p className="text-xs text-text-muted">Create a new ad set to duplicate your ad into.</p>
                  </div>
                </label>

                {/* New ad set name input */}
                {selectedAdSetOption === 'new' && (
                  <div className="ml-7 mt-2">
                    <input
                      type="text"
                      placeholder="Name your ad set"
                      value={newAdSetName}
                      onChange={(e) => setNewAdSetName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New Ad Set for New Campaign */}
          {selectedCampaignOption === 'new' && (
            <div className="border-t border-border pt-5">
              <p className="text-sm font-medium text-text-primary mb-3">
                Name your new ad set
              </p>
              <input
                type="text"
                placeholder="Name your ad set"
                value={newAdSetName}
                onChange={(e) => setNewAdSetName(e.target.value)}
                className="w-full rounded-lg border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

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
