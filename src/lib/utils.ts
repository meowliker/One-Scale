export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatPercentage(value: number): string {
  return `${(value ?? 0).toFixed(2)}%`;
}

export function formatRoas(value: number): string {
  return `${(value ?? 0).toFixed(2)}x`;
}
