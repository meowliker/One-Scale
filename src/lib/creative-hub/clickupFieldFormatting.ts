import type { ClickUpFieldValue } from '@/types/creativeHub';

export function formatClickUpFieldValue(field: ClickUpFieldValue): string {
  const rawValue = typeof field.value === 'string' ? field.value.trim() : '';
  if (!rawValue) return 'Not set';

  if (field.type === 'date') {
    const timestamp = Number(rawValue);
    if (!Number.isNaN(timestamp) && timestamp > 0) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(timestamp));
    }
  }

  if (rawValue === 'true') return 'Yes';
  if (rawValue === 'false') return 'No';

  return rawValue;
}

export function getClickUpFieldHref(field: ClickUpFieldValue): string | null {
  if (field.hasValue === false) return null;
  const formatted = formatClickUpFieldValue(field);
  return /^https?:\/\//i.test(formatted) ? formatted : null;
}
