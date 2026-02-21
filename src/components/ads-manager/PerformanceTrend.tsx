'use client';

interface PerformanceTrendProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Returns a hex color based on the absolute ROAS value using product-defined thresholds:
 *   0        → grey   (no data / no spend)
 *   < 1.0    → red    (bad)
 *   1.0–1.3  → orange (ok)
 *   1.3–1.6  → amber  (good)
 *   >= 1.6   → green  (very good)
 */
function getRoasColor(roas: number): string {
  if (roas === 0) return '#aeaeb2'; // grey
  if (roas < 1.0) return '#ff3b30'; // red
  if (roas < 1.3) return '#ff9500'; // orange
  if (roas < 1.6) return '#ffcc00'; // amber/yellow
  return '#34c759'; // green
}

export function PerformanceTrend({ data, width = 60, height = 20, className }: PerformanceTrendProps) {
  if (!data || data.length < 2) return null;

  const isUptrend = data[data.length - 1] > data[0];
  const currentRoas = data[data.length - 1];
  const strokeColor = getRoasColor(currentRoas);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Add some padding to the Y-axis
  const padding = 2;
  const chartWidth = width;
  const chartHeight = height;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * chartWidth;
      const y = chartHeight - padding - ((value - min) / range) * (chartHeight - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`Performance trend: ${isUptrend ? 'upward' : 'downward'}`}
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
