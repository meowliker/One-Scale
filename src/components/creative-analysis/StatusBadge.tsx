import { AlertTriangle } from 'lucide-react';
import type { CreativeStatus } from '@/types/creative';

interface StatusBadgeProps {
  status: CreativeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'Active') {
    return (
      <span className="text-sm font-medium text-green-600">
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-orange-500">
      <AlertTriangle className="h-3.5 w-3.5" />
      Fatigue
    </span>
  );
}
