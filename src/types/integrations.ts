export type IntegrationStatus = 'connected' | 'disconnected' | 'error';
export type IntegrationPlatform = 'clickup' | 'google_drive' | 'slack' | 'shopify' | 'klaviyo' | 'meta';

export interface Integration {
  id: string;
  name: string;
  platform: IntegrationPlatform;
  status: IntegrationStatus;
  description: string;
  lastSynced: string | null;
  iconColor: string;
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: 'open' | 'in_progress' | 'review' | 'done';
  assignee: string;
  dueDate: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  creativeType: 'image' | 'video' | 'carousel';
  description: string;
  tags: string[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedAt: string;
  thumbnailUrl: string;
  folderPath: string;
  type: 'image' | 'video' | 'folder';
}

export interface SlackChannel {
  id: string;
  name: string;
  isSelected: boolean;
}

export interface SlackNotificationRule {
  id: string;
  event: string;
  channel: string;
  isActive: boolean;
}
