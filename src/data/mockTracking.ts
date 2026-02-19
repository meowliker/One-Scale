import type { TrackingConfig, TrackingHealth } from '@/types/tracking';

export const mockTrackingConfig: TrackingConfig = {
  pixelId: 'TW-PIXEL-283947',
  domain: 'towardscalm.com',
  serverSideEnabled: true,
  attributionModel: 'last_click',
  attributionWindow: '7day',
  events: [
    {
      name: 'PageView',
      displayName: 'Page View',
      status: 'active',
      lastFired: '2025-02-12T11:58:32Z',
      count24h: 12847,
      count7d: 89234,
    },
    {
      name: 'ViewContent',
      displayName: 'View Content',
      status: 'active',
      lastFired: '2025-02-12T11:57:14Z',
      count24h: 4231,
      count7d: 29418,
    },
    {
      name: 'AddToCart',
      displayName: 'Add to Cart',
      status: 'active',
      lastFired: '2025-02-12T11:54:47Z',
      count24h: 876,
      count7d: 6124,
    },
    {
      name: 'InitiateCheckout',
      displayName: 'Initiate Checkout',
      status: 'active',
      lastFired: '2025-02-12T11:49:03Z',
      count24h: 412,
      count7d: 2887,
    },
    {
      name: 'Purchase',
      displayName: 'Purchase',
      status: 'active',
      lastFired: '2025-02-12T11:42:19Z',
      count24h: 187,
      count7d: 1304,
    },
  ],
};

export const mockTrackingHealth: TrackingHealth = {
  overall: 'healthy',
  checks: [
    {
      name: 'Pixel Installation',
      status: 'healthy',
      message: 'Pixel TW-PIXEL-283947 is correctly installed on towardscalm.com and firing on all pages.',
      lastChecked: '2025-02-12T12:00:00Z',
    },
    {
      name: 'Event Firing',
      status: 'healthy',
      message: 'All 5 configured events are firing correctly. 187 purchases tracked in the last 24 hours.',
      lastChecked: '2025-02-12T12:00:00Z',
    },
    {
      name: 'Server-Side Tracking',
      status: 'healthy',
      message: 'Server-side event delivery is active with a 98.7% match rate over the last 7 days.',
      lastChecked: '2025-02-12T12:00:00Z',
    },
    {
      name: 'Data Freshness',
      status: 'warning',
      message: 'Purchase event data has a 18-minute delay. Expected latency is under 10 minutes.',
      lastChecked: '2025-02-12T12:00:00Z',
    },
    {
      name: 'Attribution Accuracy',
      status: 'healthy',
      message: 'Last-click attribution model is active. 7-day click window covering 94.2% of conversions.',
      lastChecked: '2025-02-12T12:00:00Z',
    },
  ],
  lastUpdated: '2025-02-12T12:00:00Z',
};
