export type AttributionModel =
  | 'first_click'
  | 'last_click'
  | 'linear'
  | 'time_decay'
  | 'position_based';

export type TrackingEventStatus = 'active' | 'inactive' | 'error';

export type HealthStatus = 'healthy' | 'warning' | 'error';

export interface TrackingEvent {
  name: string;
  displayName: string;
  status: TrackingEventStatus;
  lastFired: string | null;
  count24h: number;
  count7d: number;
}

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  lastChecked: string;
}

export interface TrackingHealth {
  overall: HealthStatus;
  checks: HealthCheck[];
  lastUpdated: string;
}

export interface TrackingConfig {
  pixelId: string;
  domain: string;
  serverSideEnabled: boolean;
  attributionModel: AttributionModel;
  attributionWindow: '1day' | '7day' | '28day';
  events: TrackingEvent[];
}
