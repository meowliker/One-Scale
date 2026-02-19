import type { Creative } from '@/types/creative';
import { CreativeTableRow } from './CreativeTableRow';

interface CreativeTableProps {
  creatives: Creative[];
}

const columns = [
  { label: 'Creative', align: 'left' as const },
  { label: 'Type', align: 'left' as const },
  { label: 'Spend', align: 'left' as const },
  { label: 'ROAS', align: 'left' as const },
  { label: 'CTR', align: 'left' as const },
  { label: 'Impressions', align: 'left' as const },
  { label: 'Status', align: 'right' as const },
];

export function CreativeTable({ creatives }: CreativeTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.label}
                className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {creatives.map((creative) => (
            <CreativeTableRow key={creative.id} creative={creative} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
