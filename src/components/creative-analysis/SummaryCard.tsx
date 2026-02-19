import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: 'green' | 'blue' | 'orange';
}

const colorMap = {
  green: 'bg-green-100 text-green-600',
  blue: 'bg-blue-100 text-blue-600',
  orange: 'bg-orange-100 text-orange-600',
};

export function SummaryCard({ label, value, icon: Icon, color }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
