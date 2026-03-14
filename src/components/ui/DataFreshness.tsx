'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface DataFreshnessProps {
  lastUpdated: Date | string | null;
  className?: string;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return 'Yesterday';
}

function getFreshnessColor(date: Date): string {
  const now = new Date();
  const diffMin = (now.getTime() - date.getTime()) / 60000;

  if (diffMin < 5) return 'bg-emerald-500';
  if (diffMin < 30) return 'bg-amber-500';
  return 'bg-red-500';
}

export function DataFreshness({ lastUpdated, className = '' }: DataFreshnessProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!lastUpdated) return null;

  const date = typeof lastUpdated === 'string' ? new Date(lastUpdated) : lastUpdated;

  if (isNaN(date.getTime())) return null;

  const relativeTime = formatRelativeTime(date);
  const dotColor = getFreshnessColor(date);

  return (
    <div className={`flex items-center gap-1.5 text-xs text-text-secondary ${className}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <Clock className="h-3 w-3 opacity-50" />
      <span>Updated {relativeTime}</span>
    </div>
  );
}
