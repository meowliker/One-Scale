'use client';

interface WinnerChipProps {
  title: string;
  value: string;
}

export function WinnerChip({ title, value }: WinnerChipProps) {
  return (
    <div className="inline-flex items-start gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">
      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Winner
      </span>
      <span className="font-medium">{title}:</span>
      <span className="max-w-[560px] truncate text-blue-800">{value}</span>
    </div>
  );
}
