import type { Creative } from '@/types/creative';
import { CreativeCard } from './CreativeCard';

interface CreativeCardGridProps {
  creatives: Creative[];
}

export function CreativeCardGrid({ creatives }: CreativeCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {creatives.map((creative) => (
        <CreativeCard key={creative.id} creative={creative} />
      ))}
    </div>
  );
}
