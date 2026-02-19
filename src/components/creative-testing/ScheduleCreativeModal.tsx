'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { mockCampaigns } from '@/data/mockCampaigns';
import type { ScheduledCreative } from '@/types/creativeSchedule';

interface ScheduleCreativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (creative: Omit<ScheduledCreative, 'id' | 'createdAt' | 'status'>) => void;
}

const initialForm = {
  name: '',
  creativeName: '',
  creativeType: 'image' as const,
  thumbnailUrl: '/placeholders/ad-thumb-1.jpg',
  targetCampaignId: '',
  targetCampaignName: '',
  isNewCampaign: false,
  launchDate: '',
  dailyBudget: 50,
  testDuration: 5,
  primaryText: '',
  headline: '',
  description: '',
};

export function ScheduleCreativeModal({ isOpen, onClose, onSave }: ScheduleCreativeModalProps) {
  const [form, setForm] = useState(initialForm);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCampaignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const campaignId = e.target.value;
    const campaign = mockCampaigns.find((c) => c.id === campaignId);
    setForm((prev) => ({
      ...prev,
      targetCampaignId: campaignId,
      targetCampaignName: campaign?.name ?? '',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.targetCampaignId || !form.launchDate) return;

    onSave({
      ...form,
      dailyBudget: Number(form.dailyBudget),
      testDuration: Number(form.testDuration),
    });
    setForm(initialForm);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule New Creative" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule Name
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. UGC Test - February"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Creative Name
            </label>
            <input
              name="creativeName"
              value={form.creativeName}
              onChange={handleChange}
              placeholder="e.g. UGC Testimonial - Emma"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Creative Type
            </label>
            <select
              name="creativeType"
              value={form.creativeType}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="carousel">Carousel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Campaign
            </label>
            <select
              name="targetCampaignId"
              value={form.targetCampaignId}
              onChange={handleCampaignChange}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Select campaign...</option>
              {mockCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Launch Date
            </label>
            <input
              type="date"
              name="launchDate"
              value={form.launchDate}
              onChange={handleChange}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily Budget ($)
            </label>
            <input
              type="number"
              name="dailyBudget"
              value={form.dailyBudget}
              onChange={handleChange}
              min={5}
              step={5}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Test Duration
            </label>
            <select
              name="testDuration"
              value={form.testDuration}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value={3}>3 days</option>
              <option value={5}>5 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
            </select>
          </div>
        </div>

        {/* Ad Copy */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Primary Text
          </label>
          <textarea
            name="primaryText"
            value={form.primaryText}
            onChange={handleChange}
            rows={2}
            placeholder="Main ad copy text..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Headline
            </label>
            <input
              name="headline"
              value={form.headline}
              onChange={handleChange}
              placeholder="Ad headline"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={1}
              placeholder="Short description"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Schedule Creative
          </button>
        </div>
      </form>
    </Modal>
  );
}
