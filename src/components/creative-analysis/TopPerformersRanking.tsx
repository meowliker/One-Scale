import { Trophy, Medal } from 'lucide-react';
import type { Creative } from '@/types/creative';
import { cn, formatCurrency, formatRoas } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

interface TopPerformersRankingProps {
  creatives: Creative[];
}

function getRankDisplay(rank: number) {
  switch (rank) {
    case 1:
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
          <Trophy className="h-4 w-4" />
        </span>
      );
    case 2:
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <Medal className="h-4 w-4" />
        </span>
      );
    case 3:
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <Medal className="h-4 w-4" />
        </span>
      );
    default:
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-gray-400 text-xs font-bold">
          {rank}
        </span>
      );
  }
}

export function TopPerformersRanking({ creatives }: TopPerformersRankingProps) {
  const top5 = [...creatives].sort((a, b) => b.roas - a.roas).slice(0, 5);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Top Performers</h3>
        <p className="text-xs text-gray-500">Ranked by ROAS</p>
      </div>
      <div className="divide-y divide-gray-100">
        {top5.map((creative, index) => (
          <div
            key={creative.id}
            className={cn(
              'flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50',
              index === 0 && 'bg-yellow-50/50'
            )}
          >
            {getRankDisplay(index + 1)}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {creative.name}
              </p>
            </div>
            <Badge variant={creative.type === 'Video' ? 'info' : 'default'}>
              {creative.type}
            </Badge>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">
                {formatRoas(creative.roas)}
              </p>
              <p className="text-xs text-gray-500">
                {formatCurrency(creative.spend)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
