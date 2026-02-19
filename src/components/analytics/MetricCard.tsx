'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GradientVariant = 'blue' | 'green' | 'purple' | 'orange';

const gradientStyles: Record<GradientVariant, { bg: string; glow: string; icon: string }> = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-500/10 via-blue-400/5 to-cyan-400/10 border-blue-200/60',
    glow: 'shadow-blue-200/40',
    icon: 'bg-blue-100 text-blue-600',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-500/10 via-green-400/5 to-teal-400/10 border-emerald-200/60',
    glow: 'shadow-emerald-200/40',
    icon: 'bg-emerald-100 text-emerald-600',
  },
  purple: {
    bg: 'bg-gradient-to-br from-purple-500/10 via-violet-400/5 to-fuchsia-400/10 border-purple-200/60',
    glow: 'shadow-purple-200/40',
    icon: 'bg-purple-100 text-purple-600',
  },
  orange: {
    bg: 'bg-gradient-to-br from-orange-500/10 via-amber-400/5 to-yellow-400/10 border-orange-200/60',
    glow: 'shadow-orange-200/40',
    icon: 'bg-orange-100 text-orange-600',
  },
};

function parseNumericValue(value: string): { prefix: string; number: number; suffix: string; decimals: number } | null {
  const match = value.match(/^([^0-9]*?)([\d,]+\.?\d*)(.*?)$/);
  if (!match) return null;
  const prefix = match[1];
  const numStr = match[2].replace(/,/g, '');
  const number = parseFloat(numStr);
  if (isNaN(number)) return null;
  const decimalMatch = numStr.match(/\.(\d+)/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;
  const suffix = match[3];
  return { prefix, number, suffix, decimals };
}

function formatAnimatedNumber(num: number, decimals: number, useCommas: boolean): string {
  const fixed = num.toFixed(decimals);
  if (!useCommas) return fixed;
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export interface MetricCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  gradient?: GradientVariant;
}

export function MetricCard({ title, value, change, icon, gradient }: MetricCardProps) {
  const isPositive = change >= 0;
  const [displayValue, setDisplayValue] = useState(value);
  const animatedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const animate = useCallback(() => {
    const parsed = parseNumericValue(value);
    if (!parsed || animatedRef.current) {
      setDisplayValue(value);
      return;
    }
    animatedRef.current = true;

    const duration = 800;
    const startTime = performance.now();
    const target = parsed.number;
    const hasCommas = value.includes(',');

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      const formatted = `${parsed.prefix}${formatAnimatedNumber(current, parsed.decimals, hasCommas)}${parsed.suffix}`;
      setDisplayValue(formatted);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, [value]);

  useEffect(() => {
    animate();
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate]);

  const gradientStyle = gradient ? gradientStyles[gradient] : null;

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-shadow',
        gradientStyle
          ? cn(gradientStyle.bg, 'shadow-md hover:shadow-lg', gradientStyle.glow)
          : 'border-border bg-surface-elevated shadow-sm hover:shadow-md'
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            gradientStyle ? gradientStyle.icon : 'bg-primary/10 text-primary-light'
          )}
        >
          {icon}
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            isPositive
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          )}
        >
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {isPositive ? '+' : ''}
          {change.toFixed(1)}%
        </div>
      </div>
      <div className="mt-3">
        <p className="text-sm font-medium text-text-muted">{title}</p>
        <p className="mt-1 text-2xl font-bold text-text-primary">{displayValue}</p>
      </div>
    </div>
  );
}
