'use client';

interface WinnerChipProps {
  title: string;
  value: string;
}

export function WinnerChip({ title, value }: WinnerChipProps) {
  return (
    <div className="inline-flex items-start gap-2 rounded-full border border-blue-300/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300">
      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Winner
      </span>
      <span className="font-medium">{title}:</span>
      <span className="max-w-[560px] truncate">{value}</span>
    </div>
  );
}
