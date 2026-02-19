'use client';

import { useState } from 'react';
import { X, Clock, Mail, Palette } from 'lucide-react';
import toast from 'react-hot-toast';

interface ScheduleReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportName: string;
}

export function ScheduleReportModal({
  isOpen,
  onClose,
  reportName,
}: ScheduleReportModalProps) {
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    'weekly'
  );
  const [recipients, setRecipients] = useState('');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [whiteLabel, setWhiteLabel] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#3b82f6');

  const handleSave = () => {
    if (!recipients.trim()) {
      toast.error('Please enter at least one recipient email');
      return;
    }
    toast.success(`Schedule saved for "${reportName}"`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Schedule Report
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Frequency
            </label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                    frequency === f
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
              <Mail className="h-3.5 w-3.5" />
              Email Recipients
            </label>
            <input
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Separate multiple emails with commas
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeCharts}
              onChange={(e) => setIncludeCharts(e.target.checked)}
              className="rounded border-gray-300"
            />
            Include charts in report
          </label>

          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={whiteLabel}
                onChange={(e) => setWhiteLabel(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Palette className="h-4 w-4 text-gray-500" />
              White-label report
            </label>

            {whiteLabel && (
              <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Custom Logo URL
                  </label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Brand Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded border border-gray-200"
                    />
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="w-28 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
