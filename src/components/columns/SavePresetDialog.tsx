'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useColumnPresetStore } from '@/stores/columnPresetStore';

export interface SavePresetDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SavePresetDialog({ isOpen, onClose }: SavePresetDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const saveCustomPreset = useColumnPresetStore((s) => s.saveCustomPreset);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Preset name is required.');
      return;
    }

    saveCustomPreset(trimmed);
    setName('');
    setError('');
    onClose();
  }

  function handleClose() {
    setName('');
    setError('');
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Save Column Preset" size="sm">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="preset-name"
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            Preset Name
          </label>
          <input
            id="preset-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="e.g. My Custom View"
            className="w-full rounded-lg border border-border-light bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-md border border-border-light bg-surface-elevated px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
          >
            <Save className="h-4 w-4" />
            Save Preset
          </button>
        </div>
      </div>
    </Modal>
  );
}
