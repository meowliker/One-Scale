import { rest } from '@/app/api/lib/supabase-persistence';

function withPaging(path: string, limit: number, offset: number): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}limit=${limit}&offset=${offset}`;
}

export async function fetchAllRestRows<T>(
  path: string,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxRows = options.maxRows ?? 100_000;
  const rows: T[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await rest<T[]>(withPaging(path, pageSize, offset));
    rows.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
  }

  return rows;
}
