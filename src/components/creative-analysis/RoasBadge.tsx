import { formatRoas } from '@/lib/utils';

interface RoasBadgeProps {
  value: number;
}

export function RoasBadge({ value }: RoasBadgeProps) {
  const color = value >= 1 ? 'text-green-600' : 'text-orange-500';

  return (
    <span className={`font-semibold ${color}`}>
      {formatRoas(value)}
    </span>
  );
}
