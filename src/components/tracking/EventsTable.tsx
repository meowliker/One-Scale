import type { TrackingEvent } from '@/types/tracking';
import { cn, formatNumber } from '@/lib/utils';

interface EventsTableProps {
  events: TrackingEvent[];
}

const statusConfig: Record<
  TrackingEvent['status'],
  { dot: string; label: string }
> = {
  active: { dot: 'bg-green-500', label: 'Active' },
  inactive: { dot: 'bg-gray-400', label: 'Inactive' },
  error: { dot: 'bg-red-500', label: 'Error' },
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return '--';
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function EventsTable({ events }: EventsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Event Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Last Fired
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              24h Count
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              7d Count
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map((event, index) => {
            const { dot, label } = statusConfig[event.status];
            return (
              <tr
                key={event.name}
                className={cn(
                  'transition-colors hover:bg-gray-50',
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                )}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    {index > 0 && (
                      <span className="text-xs text-gray-300">&rarr;</span>
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {event.displayName}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('inline-block h-2 w-2 rounded-full', dot)}
                    />
                    <span className="text-sm text-gray-600">{label}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {formatTimestamp(event.lastFired)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {formatNumber(event.count24h)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {formatNumber(event.count7d)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
