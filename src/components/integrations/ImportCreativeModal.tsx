'use client';

import { useState } from 'react';
import { Calendar, DollarSign, Tag, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import type { ClickUpTask, GoogleDriveFile } from '@/types/integrations';

interface ImportCreativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: { type: 'clickup'; data: ClickUpTask } | { type: 'drive'; data: GoogleDriveFile } | null;
}

const campaignOptions = [
  { value: 'summer-sale', label: 'Summer Sale 2026' },
  { value: 'product-launch', label: 'New Product Launch' },
  { value: 'retargeting', label: 'Retargeting - Cart Abandonment' },
  { value: 'brand-awareness', label: 'Brand Awareness Q1' },
  { value: 'valentines', label: "Valentine's Day Promo" },
];

export function ImportCreativeModal({ isOpen, onClose, source }: ImportCreativeModalProps) {
  const defaultName = source
    ? source.type === 'clickup'
      ? source.data.name
      : source.data.name
    : '';

  const [creativeName, setCreativeName] = useState(defaultName);
  const [campaign, setCampaign] = useState(campaignOptions[0].value);
  const [launchDate, setLaunchDate] = useState('');
  const [budget, setBudget] = useState('');

  // Reset form when source changes
  const handleOpen = () => {
    setCreativeName(defaultName);
    setCampaign(campaignOptions[0].value);
    setLaunchDate('');
    setBudget('');
  };

  // Ensure form state updates when source changes
  if (isOpen && creativeName === '' && defaultName !== '') {
    handleOpen();
  }

  const handleImport = () => {
    if (!creativeName.trim()) {
      toast.error('Please enter a creative name');
      return;
    }

    toast.success(`"${creativeName}" imported and scheduled successfully`);
    onClose();
  };

  const sourceLabel = source
    ? source.type === 'clickup'
      ? 'ClickUp Task'
      : 'Google Drive File'
    : '';

  const sourceDescription = source
    ? source.type === 'clickup'
      ? `Task: ${source.data.name} (${source.data.creativeType})`
      : `File: ${source.data.name} (${source.data.size})`
    : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Creative" size="md">
      <div className="space-y-4">
        {/* Source Info */}
        {source && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">
                {sourceLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-blue-800">
              {sourceDescription}
            </p>
          </div>
        )}

        {/* Creative Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Creative Name
          </label>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={creativeName}
              onChange={(e) => setCreativeName(e.target.value)}
              placeholder="Enter creative name..."
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Target Campaign */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Campaign
          </label>
          <select
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {campaignOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Launch Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Launch Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Budget */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Budget
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          Import &amp; Schedule
        </button>
      </div>
    </Modal>
  );
}
