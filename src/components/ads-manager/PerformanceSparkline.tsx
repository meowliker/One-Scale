'use client';

import { useState, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';
import { getSparklineData } from '@/data/mockSparklineData';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import { PortalTooltip } from '@/components/ui/PortalTooltip';

interface PerformanceSparklineProps {
  entityId: string;
  data?: SparklineDataPoint[];
}

function getTrendColor(data: SparklineDataPoint[]): string {
  if (data.length < 2) return '#7c5cfc';

  const first = data[0].roas;
  const last = data[data.length - 1].roas;
  const threshold = first * 0.05; // 5% tolerance for "roughly same"

  if (last > first + threshold) return '#34d399'; // emerald-400 (up)
  if (last < first - threshold) return '#f87171'; // red-400 (down)
  return '#7c5cfc'; // primary (stable)
}

function formatRoasChange(first: number, last: number): { text: string; arrow: string; color: string } {
  if (first === 0 && last === 0) return { text: '0.00 → 0.00 (0%)', arrow: '', color: '#94a3b8' };

  const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
  const sign = pctChange >= 0 ? '+' : '';
  const color = pctChange > 0 ? '#34d399' : pctChange < 0 ? '#f87171' : '#94a3b8';
  const arrow = pctChange > 0 ? '\u2191' : pctChange < 0 ? '\u2193' : '\u2192';

  return {
    text: `${first.toFixed(2)} \u2192 ${last.toFixed(2)} (${sign}${pctChange.toFixed(1)}%)`,
    arrow,
    color,
  };
}

export function PerformanceSparkline({ entityId, data: dataProp }: PerformanceSparklineProps) {
  const data = (dataProp && dataProp.length >= 2) ? dataProp : getSparklineData(entityId);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowTooltip(false), 150);
  }, []);

  if (!data || data.length === 0) {
    return (
      <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-text-dimmed">
        --
      </td>
    );
  }

  const trendColor = getTrendColor(data);
  const gradientId = `sparkGrad-${entityId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const firstRoas = data[0].roas;
  const lastRoas = data[data.length - 1].roas;
  const roasChange = formatRoasChange(firstRoas, lastRoas);

  const totalSpend = data.reduce((sum, d) => sum + d.spend, 0);
  const daysWithSpend = data.filter((d) => d.spend > 0).length;
  const avgSpend = daysWithSpend > 0 ? totalSpend / daysWithSpend : 0;

  return (
    <td
      ref={cellRef}
      className="relative whitespace-nowrap px-3 py-3"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Mini inline sparkline */}
      <div className="flex items-center justify-center" style={{ width: 120, height: 36 }}>
        <AreaChart
          width={120}
          height={36}
          data={data}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity={0.30} />
              <stop offset="100%" stopColor={trendColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="roas"
            stroke={trendColor}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </div>

      {/* Hover tooltip (rendered via portal to avoid overflow clipping) */}
      <PortalTooltip anchorRef={cellRef} visible={showTooltip}>
        <div
          className="rounded-lg border border-border-light bg-surface-elevated shadow-xl"
          style={{ width: 272, padding: 16 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Title */}
          <p className="mb-2 text-xs font-semibold text-text-primary">
            Performance Trend (7d)
          </p>

          {/* Larger chart */}
          <div
            className="mb-3 overflow-hidden rounded"
            style={{ width: 240, height: 100 }}
          >
            <AreaChart
              width={240}
              height={100}
              data={data}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            >
              <defs>
                <linearGradient id={`${gradientId}-lg`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={trendColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e2235"
                horizontal
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={28}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <RechartsTooltip
                contentStyle={{
                  background: '#12141d',
                  border: '1px solid #282d42',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#f1f5f9',
                }}
                labelStyle={{ color: '#94a3b8', fontSize: 10 }}
                formatter={(value: number | undefined) => [
                  value != null ? value.toFixed(2) : '--',
                  'ROAS',
                ]}
              />
              <Area
                type="monotone"
                dataKey="roas"
                stroke={trendColor}
                strokeWidth={2}
                fill={`url(#${gradientId}-lg)`}
                dot={{ r: 2.5, fill: trendColor, stroke: '#1a1d2b', strokeWidth: 1.5 }}
                activeDot={{ r: 4, fill: trendColor, stroke: '#1a1d2b', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </div>

          {/* Summary stats */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-text-muted">ROAS:</span>
              <span style={{ color: roasChange.color }} className="font-medium">
                {roasChange.arrow}
              </span>
              <span className="text-text-secondary font-mono">
                {roasChange.text}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-text-muted">Avg Spend:</span>
              <span className="text-text-secondary font-mono">
                ${avgSpend.toFixed(2)}/day
              </span>
            </div>
          </div>
        </div>
      </PortalTooltip>
    </td>
  );
}
