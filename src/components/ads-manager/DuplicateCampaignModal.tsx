'use client';

import { useState } from 'react';
import { X, Copy, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface DuplicateCampaignModalProps {
  campaignId: string;
  campaignName: string;
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DuplicateCampaignModal({
  campaignId,
  campaignName,
  storeId,
  onClose,
  onSuccess,
}: DuplicateCampaignModalProps) {
  const [numberOfCopies, setNumberOfCopies] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDuplicate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/meta/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          objectId: campaignId,
          objectType: 'campaign',
          numberOfCopies,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to duplicate campaign');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate campaign');
    } finally {
      setIsLoading(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white dark:bg-surface-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Duplicate campaign</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {numberOfCopies} {numberOfCopies === 1 ? 'copy' : 'copies'} of campaign will be created
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
        <div className="px-6 py-5 space-y-5">
          {/* Campaign name display */}
          <div className="rounded-lg bg-surface-hover/50 px-4 py-3">
            <p className="text-xs text-text-muted mb-1">Campaign</p>
            <p className="text-sm font-medium text-text-primary truncate">{campaignName}</p>
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
            <p className="text-xs text-text-muted mt-1.5">
              All ad sets and ads within this campaign will also be duplicated.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Duplicate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
