import type { TrackingConfig } from '@/types/tracking';
import { Badge } from '@/components/ui/Badge';
import { Server, Shield, Eye } from 'lucide-react';

interface ServerSideConfigProps {
  config: TrackingConfig;
}

export function ServerSideConfig({ config }: ServerSideConfigProps) {
  const endpointUrl = `https://track.${config.domain}/api/tracking/collect`;

  return (
    <div className="space-y-6">
      {/* Configuration fields */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">
          Server-Side Configuration
        </h3>
        <div className="space-y-4">
          {/* Domain */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Domain
              </label>
              <p className="text-xs text-gray-400">Your tracking domain</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
              <code className="text-sm font-mono text-gray-900">
                {config.domain}
              </code>
            </div>
          </div>

          {/* Server-Side Status */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Server-Side Status
              </label>
              <p className="text-xs text-gray-400">
                Event forwarding from your server
              </p>
            </div>
            <Badge
              variant={config.serverSideEnabled ? 'success' : 'danger'}
            >
              {config.serverSideEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          {/* Endpoint URL */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Endpoint URL
              </label>
              <p className="text-xs text-gray-400">
                Where server events are sent
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
              <code className="text-sm font-mono text-gray-900">
                {endpointUrl}
              </code>
            </div>
          </div>

          {/* API Key */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">
                API Key
              </label>
              <p className="text-xs text-gray-400">
                Authentication for server-side events
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
              <code className="text-sm font-mono tracking-wider text-gray-900">
                ••••••••••••3947
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits info card */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="mb-3 flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-900">
            Benefits of Server-Side Tracking
          </h3>
        </div>
        <ul className="space-y-3">
          {[
            {
              icon: Shield,
              title: 'Better Data Accuracy',
              description:
                'Server-side events bypass ad blockers and browser restrictions, capturing up to 30% more conversion data.',
            },
            {
              icon: Eye,
              title: 'iOS 14+ Compatible',
              description:
                'Maintain tracking accuracy despite ATT opt-outs and Intelligent Tracking Prevention (ITP).',
            },
            {
              icon: Server,
              title: 'First-Party Data Control',
              description:
                'All event data flows through your own domain, giving you complete control over what is shared with ad platforms.',
            },
          ].map((benefit) => (
            <li key={benefit.title} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <benefit.icon className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-blue-900">
                  {benefit.title}
                </span>
                <p className="text-xs text-blue-700">{benefit.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
