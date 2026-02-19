import type {
  Integration,
  ClickUpTask,
  GoogleDriveFile,
  SlackChannel,
  SlackNotificationRule,
} from '@/types/integrations';
import {
  mockIntegrations,
  mockClickUpTasks,
  mockGoogleDriveFiles,
  mockSlackChannels,
  mockSlackNotificationRules,
} from '@/data/mockIntegrations';
import { useConnectionStore } from '@/stores/connectionStore';

export async function getIntegrations(): Promise<Integration[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const connectionStatus = useConnectionStore.getState().status;

  // If we have real connection status, update the meta and shopify integrations
  if (connectionStatus) {
    return mockIntegrations.map((intg) => {
      if (intg.platform === 'meta') {
        return {
          ...intg,
          status: connectionStatus.meta.connected ? 'connected' as const : 'disconnected' as const,
          lastSynced: connectionStatus.meta.lastSynced || intg.lastSynced,
        };
      }
      if (intg.platform === 'shopify') {
        return {
          ...intg,
          status: connectionStatus.shopify.connected ? 'connected' as const : 'disconnected' as const,
          lastSynced: connectionStatus.shopify.lastSynced || intg.lastSynced,
        };
      }
      return intg;
    });
  }

  return mockIntegrations;
}

export async function getClickUpTasks(): Promise<ClickUpTask[]> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return mockClickUpTasks;
}

export async function getGoogleDriveFiles(): Promise<GoogleDriveFile[]> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return mockGoogleDriveFiles;
}

export async function getSlackChannels(): Promise<SlackChannel[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return mockSlackChannels;
}

export async function getSlackNotificationRules(): Promise<SlackNotificationRule[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return mockSlackNotificationRules;
}
