'use client';

import { useState } from 'react';
import { Plus, Hash, Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import type { SlackChannel, SlackNotificationRule } from '@/types/integrations';

interface SlackConfigProps {
  channels: SlackChannel[];
  rules: SlackNotificationRule[];
}

const eventOptions = [
  'Creative fatigue detected',
  'Daily performance report',
  'Budget threshold exceeded',
  'New creative launched',
  'Campaign paused automatically',
  'ROAS dropped below target',
  'Weekly summary',
];

export function SlackConfig({ channels: initialChannels, rules: initialRules }: SlackConfigProps) {
  const [channels, setChannels] = useState(initialChannels);
  const [rules, setRules] = useState(initialRules);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleEvent, setNewRuleEvent] = useState(eventOptions[0]);
  const [newRuleChannel, setNewRuleChannel] = useState(
    initialChannels[0]?.name || ''
  );

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === channelId ? { ...ch, isSelected: !ch.isSelected } : ch
      )
    );
    toast.success('Channel preference updated');
  };

  const toggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, isActive: !r.isActive } : r
      )
    );
  };

  const addRule = () => {
    if (!newRuleEvent || !newRuleChannel) return;

    const newRule: SlackNotificationRule = {
      id: `rule-${Date.now()}`,
      event: newRuleEvent,
      channel: newRuleChannel,
      isActive: true,
    };

    setRules((prev) => [...prev, newRule]);
    setShowAddRule(false);
    setNewRuleEvent(eventOptions[0]);
    setNewRuleChannel(channels[0]?.name || '');
    toast.success('Notification rule added');
  };

  const removeRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    toast.success('Rule removed');
  };

  return (
    <div className="space-y-6">
      {/* Channel Selection */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Connected Channels
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Select which Slack channels can receive notifications.
        </p>
        <div className="space-y-2">
          {channels.map((channel) => (
            <label
              key={channel.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={channel.isSelected}
                onChange={() => toggleChannel(channel.id)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Hash className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700">{channel.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Notification Rules */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Notification Rules
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure which events trigger Slack notifications.
            </p>
          </div>
          <button
            onClick={() => setShowAddRule(true)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Rule
          </button>
        </div>

        {/* Add Rule Form */}
        {showAddRule && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start justify-between">
              <h4 className="text-sm font-medium text-gray-900">New Rule</h4>
              <button
                onClick={() => setShowAddRule(false)}
                className="rounded p-0.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Event
                </label>
                <select
                  value={newRuleEvent}
                  onChange={(e) => setNewRuleEvent(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {eventOptions.map((event) => (
                    <option key={event} value={event}>
                      {event}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Channel
                </label>
                <select
                  value={newRuleChannel}
                  onChange={(e) => setNewRuleChannel(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.name}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={addRule}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Add Rule
              </button>
            </div>
          </div>
        )}

        {/* Rules Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Event
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Channel
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Active
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-900">{rule.event}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Hash className="h-3 w-3" />
                      {rule.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        rule.isActive ? 'bg-blue-600' : 'bg-gray-300'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                          rule.isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rules.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">
              No notification rules configured. Click &quot;Add Rule&quot; to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
