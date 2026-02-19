#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const cwd = process.cwd();
const sqlitePath = path.join(cwd, 'data', 'app.db');
const outputPath = path.join(cwd, 'supabase', 'seed.sql');

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite DB not found: ${sqlitePath}`);
  process.exit(1);
}

const db = new Database(sqlitePath, { readonly: true });

const TABLES = [
  'stores',
  'connections',
  'store_ad_accounts',
  'meta_endpoint_snapshots',
];

function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value).replace(/'/g, "''");
  return `'${text}'`;
}

const lines = [];
lines.push('-- Generated from SQLite: data/app.db');
lines.push('-- Import after running supabase/schema.sql');
lines.push('begin;');

for (const table of TABLES) {
  const rows = db.prepare(`select * from ${table}`).all();
  if (rows.length === 0) continue;

  const columns = Object.keys(rows[0]);
  lines.push(`-- ${table}: ${rows.length} rows`);
  lines.push(`truncate table ${table} restart identity cascade;`);

  for (const row of rows) {
    const values = columns.map((col) => quote(row[col])).join(', ');
    lines.push(`insert into ${table} (${columns.join(', ')}) values (${values});`);
  }
}

lines.push('commit;');
lines.push('');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'));
console.log(`Wrote ${outputPath}`);
