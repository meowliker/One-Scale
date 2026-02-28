'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
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
    toast.success(`Preset "${trimmed}" saved successfully`);
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
            className="w-full rounded-lg border border-border-light bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="h-4 w-4" />
            Save Preset
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg border border-border-light bg-surface-elevated text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
