'use client';

import { useState } from 'react';
import type { TrackingConfig } from '@/types/tracking';
import { cn } from '@/lib/utils';
import { Check, Copy, Globe } from 'lucide-react';
import { CodeSnippet } from '@/components/tracking/CodeSnippet';
import { EventsTable } from '@/components/tracking/EventsTable';
import toast from 'react-hot-toast';

interface PixelSetupGuideProps {
  config: TrackingConfig;
}

export function PixelSetupGuide({ config }: PixelSetupGuideProps) {
  const [pixelCopied, setPixelCopied] = useState(false);
  const trackingBaseUrl =
    (
      process.env.NEXT_PUBLIC_TRACKING_PIXEL_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    ).replace(/\/+$/, '');

  const handleCopyPixelId = async () => {
    await navigator.clipboard.writeText(config.pixelId);
    setPixelCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setPixelCopied(false), 2000);
  };

  const snippetCode = `<!-- Tracking Pixel for ${config.domain} -->
<script>
  !function(t,r,a,c,k){t[k]=t[k]||function(){
    (t[k].q=t[k].q||[]).push(arguments)};
    var s=r.createElement('script');
    s.async=1;s.src=a;
    r.head.appendChild(s);
  }(window,document,
    '${trackingBaseUrl}/api/tracking/pixel?pixelId=${config.pixelId}',
    '${config.pixelId}','tw');
  tw('init','${config.pixelId}');
  tw('track','PageView');
</script>`;
  const urlParamsTemplate = 'utm_campaign={{campaign.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';
  const urlParamsNameOnlyTemplate = 'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';

  const steps = [
    {
      number: 1,
      title: 'Install the Tracking Pixel',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Copy your pixel ID and add the tracking snippet to your website&apos;s{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-800">
              &lt;head&gt;
            </code>{' '}
            section. This script now saves campaign/ad identifiers to Shopify cart attributes so orders can be mapped back to campaigns.
          </p>
          <p className="text-xs text-amber-700">
            Tracking script host: <code className="rounded bg-amber-100 px-1.5 py-0.5">{trackingBaseUrl || '(not configured)'}</code>
          </p>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Pixel ID:</span>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
              <code className="text-sm font-mono font-medium text-gray-900">
                {config.pixelId}
              </code>
              <button
                onClick={handleCopyPixelId}
                className="ml-1 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
              >
                {pixelCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <CodeSnippet code={snippetCode} language="html" />

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Recommended Meta URL Parameters</p>
            <p className="mt-1 text-xs text-amber-800">
              Add this template in Meta ads for highest match rate:
            </p>
            <code className="mt-2 block rounded bg-white px-2 py-1 text-xs text-amber-900">
              {urlParamsTemplate}
            </code>
            <p className="mt-2 text-xs text-amber-800">
              Your existing name-based UTM format is also supported:
            </p>
            <code className="mt-2 block rounded bg-white px-2 py-1 text-xs text-amber-900">
              {urlParamsNameOnlyTemplate}
            </code>
          </div>
        </div>
      ),
    },
    {
      number: 2,
      title: 'Verify Installation',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Once installed, we will automatically detect your pixel on your
            domain.
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  {config.domain}
                </span>
              </div>
              <p className="text-xs text-green-600">
                Pixel verified and active
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      number: 3,
      title: 'Configure Events',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Track key conversion events across your customer funnel. All events
            below are currently being tracked.
          </p>
          <EventsTable events={config.events} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {steps.map((step) => (
        <div
          key={step.number}
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                'bg-blue-600 text-white'
              )}
            >
              {step.number}
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {step.title}
            </h3>
          </div>
          {step.content}
        </div>
      ))}
    </div>
  );
}
