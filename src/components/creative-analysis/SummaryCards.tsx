import { Layers, Image, Video, AlertTriangle } from 'lucide-react';
import type { CreativeSummary } from '@/types/creative';
import { SummaryCard } from './SummaryCard';

interface SummaryCardsProps {
  summary: CreativeSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <SummaryCard
        label="Total Creatives"
        value={summary.totalCreatives}
        icon={Layers}
        color="green"
      />
      <SummaryCard
        label="Images"
        value={summary.images}
        icon={Image}
        color="blue"
      />
      <SummaryCard
        label="Videos"
        value={summary.videos}
        icon={Video}
        color="green"
      />
      <SummaryCard
        label="Fatigued"
        value={summary.fatigued}
        icon={AlertTriangle}
        color="orange"
      />
    </div>
  );
}
