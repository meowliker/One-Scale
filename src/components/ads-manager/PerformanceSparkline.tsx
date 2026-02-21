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

/**
 * Returns a hex color based on the absolute ROAS value using product-defined thresholds:
 *   0        → grey  (no data / no spend)
 *   < 1.0    → red   (bad)
 *   1.0–1.3  → orange (ok)
 *   1.3–1.6  → green (good)
 *   >= 1.6   → green (very good)
 */
function getRoasColor(roas: number): string {
  if (roas === 0) return '#aeaeb2'; // grey
  if (roas < 1.0) return '#ff3b30'; // red
  if (roas < 1.3) return '#ff9500'; // orange
  return '#34c759'; // green (covers both 1.3–1.6 and >= 1.6)
}

function getTrendColor(data: SparklineDataPoint[]): string {
  if (data.length < 2) return '#0071e3';
  // Use the current (last) ROAS value to determine color, not direction
  const last = data[data.length - 1].roas;
  return getRoasColor(last);
}

function formatRoasChange(first: number, last: number): { text: string; arrow: string; color: string } {
  if (first === 0 && last === 0) return { text: '0.00 → 0.00 (0%)', arrow: '', color: '#aeaeb2' };

  const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
  const sign = pctChange >= 0 ? '+' : '';
  // Color is based on the current (ending) ROAS level, not the direction of change
  const color = getRoasColor(last);
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
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-[#aeaeb2]">
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
      className="relative whitespace-nowrap px-3 py-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Mini inline sparkline */}
      <div className="flex items-center justify-center" style={{ width: 100, height: 28 }}>
        <AreaChart
          width={100}
          height={28}
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
          className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-lg"
          style={{ width: 272, padding: 16 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Title */}
          <p className="mb-2 text-xs font-semibold text-[#1d1d1f]">
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
                stroke="rgba(0,0,0,0.04)"
                horizontal
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: '#86868b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#86868b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={28}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <RechartsTooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#1d1d1f',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                }}
                labelStyle={{ color: '#86868b', fontSize: 10 }}
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
                dot={{ r: 2.5, fill: trendColor, stroke: '#ffffff', strokeWidth: 1.5 }}
                activeDot={{ r: 4, fill: trendColor, stroke: '#ffffff', strokeWidth: 2 }}
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
