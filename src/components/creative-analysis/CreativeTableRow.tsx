import { ImageIcon, Video } from 'lucide-react';
import type { Creative } from '@/types/creative';
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/utils';
import { RoasBadge } from './RoasBadge';
import { StatusBadge } from './StatusBadge';

interface CreativeTableRowProps {
  creative: Creative;
}

export function CreativeTableRow({ creative }: CreativeTableRowProps) {
  const TypeIcon = creative.type === 'Image' ? ImageIcon : Video;
  const iconBg = creative.type === 'Image' ? 'bg-blue-50 text-blue-500' : 'bg-green-50 text-green-500';

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-4 px-6">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
            <TypeIcon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-gray-900">{creative.name}</span>
        </div>
      </td>
      <td className="py-4 px-6 text-sm text-gray-600">{creative.type}</td>
      <td className="py-4 px-6 text-sm text-gray-900 font-medium">{formatCurrency(creative.spend)}</td>
      <td className="py-4 px-6"><RoasBadge value={creative.roas} /></td>
      <td className="py-4 px-6 text-sm text-gray-600">{formatPercentage(creative.ctr)}</td>
      <td className="py-4 px-6 text-sm text-gray-900">{formatNumber(creative.impressions)}</td>
      <td className="py-4 px-6 text-right"><StatusBadge status={creative.status} /></td>
    </tr>
  );
}
