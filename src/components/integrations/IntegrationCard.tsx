'use client';

import {
  CheckSquare,
  HardDrive,
  MessageSquare,
  ShoppingBag,
  Mail,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Integration, IntegrationPlatform } from '@/types/integrations';
import { useConnectionStore } from '@/stores/connectionStore';

interface IntegrationCardProps {
  integration: Integration;
  isActive: boolean;
  onSelect: (id: string) => void;
  onToggleConnection: (id: string) => void;
}

const platformIcons: Record<IntegrationPlatform, typeof CheckSquare> = {
  clickup: CheckSquare,
  google_drive: HardDrive,
  slack: MessageSquare,
  shopify: ShoppingBag,
  klaviyo: Mail,
  meta: Globe,
};

function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function IntegrationCard({
  integration,
  isActive,
  onSelect,
  onToggleConnection,
}: IntegrationCardProps) {
  const Icon = platformIcons[integration.platform];
  const isConnected = integration.status === 'connected';
  const isError = integration.status === 'error';
  const connectionStatus = useConnectionStore((s) => s.status);

  // Get connected account details for Meta and Shopify
  let connectedDetail: string | null = null;
  if (isConnected && connectionStatus) {
    if (integration.platform === 'meta' && connectionStatus.meta.accountId) {
      connectedDetail = connectionStatus.meta.accountName
        ? `${connectionStatus.meta.accountName} (${connectionStatus.meta.accountId})`
        : connectionStatus.meta.accountId;
    }
    if (integration.platform === 'shopify' && connectionStatus.shopify.shopDomain) {
      connectedDetail = connectionStatus.shopify.shopName || connectionStatus.shopify.shopDomain;
    }
  }

  return (
    <div
      onClick={() => isConnected ? onSelect(integration.id) : undefined}
      className={cn(
        'relative rounded-lg border bg-white p-5 transition-all',
        isConnected && 'cursor-pointer hover:shadow-md',
        isActive && 'ring-2 ring-blue-500 border-blue-500',
        !isActive && 'border-gray-200',
        isError && 'border-red-200'
      )}
    >
      {/* Colored left border accent */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-lg',
          isConnected && 'bg-green-500',
          integration.status === 'disconnected' && 'bg-gray-300',
          isError && 'bg-red-500'
        )}
      />

      <div className="flex items-start gap-4">
        {/* Platform Icon */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${integration.iconColor}15` }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: integration.iconColor }}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              {integration.name}
            </h3>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                isConnected && 'bg-green-50 text-green-700',
                integration.status === 'disconnected' && 'bg-gray-100 text-gray-500',
                isError && 'bg-red-50 text-red-700'
              )}
            >
              {integration.status === 'connected' && 'Connected'}
              {integration.status === 'disconnected' && 'Disconnected'}
              {integration.status === 'error' && 'Error'}
            </span>
          </div>

          {/* Connected account detail */}
          {connectedDetail && (
            <p className="mt-0.5 text-xs font-medium text-blue-600 truncate">
              {connectedDetail}
            </p>
          )}

          <p className="mt-1 text-xs text-gray-500 line-clamp-2">
            {integration.description}
          </p>

          <div className="mt-3 flex items-center justify-between">
            {isConnected && (
              <span className="text-xs text-gray-400">
                Synced {formatLastSynced(integration.lastSynced)}
              </span>
            )}
            {!isConnected && <span />}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleConnection(integration.id);
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isConnected
                  ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {isConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
