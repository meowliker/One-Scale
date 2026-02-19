'use client';

interface PerformanceTrendProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function PerformanceTrend({ data, width = 60, height = 20, className }: PerformanceTrendProps) {
  if (!data || data.length < 2) return null;

  const isUptrend = data[data.length - 1] > data[0];
  const strokeColor = isUptrend ? '#16a34a' : '#dc2626'; // green-600 / red-600

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
