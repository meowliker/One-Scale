'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { Upload, Download, FileSpreadsheet, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { InboxCreative, CreativeBatch } from '@/types/creativeHub';

interface ParsedRow {
  creative_name: string;
  ad_set: string;
  headline: string;
  primary_text: string;
  budget: string;
  matchedCreative?: InboxCreative;
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });
}

function generateTemplate(creatives: InboxCreative[]): string {
  const header = 'creative_name,ad_set,headline,primary_text,budget';
  const rows = creatives.map(
    (c, i) =>
      `${c.creativeName},Batch ${Math.floor(i / 3) + 1},"Your headline here","Your primary text here",20`
  );
  return [header, ...rows].join('\n');
}

function matchCreative(name: string, creatives: InboxCreative[]): InboxCreative | undefined {
  const lower = name.toLowerCase().trim();
  // Exact match first
  const exact = creatives.find((c) => c.creativeName.toLowerCase() === lower);
  if (exact) return exact;
  // Includes match
  return creatives.find(
    (c) =>
      c.creativeName.toLowerCase().includes(lower) || lower.includes(c.creativeName.toLowerCase())
  );
}

interface ImportTabProps {
  creatives: InboxCreative[];
  onLaunchFromCSV?: (batches: CreativeBatch[]) => void;
}

export function ImportTab({ creatives, onLaunchFromCSV }: ImportTabProps) {
  const { createBatch, clearBatches, updateLaunchConfig, setLaunchCenterTab } =
    useCreativeHubStore();
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readyCreatives = useMemo(
    () => creatives.filter((c) => c.uploadStatus === 'ready'),
    [creatives]
  );

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== 'string') return;
        const rawRows = parseCSV(text);
        const mapped: ParsedRow[] = rawRows.map((row) => ({
          creative_name: row.creative_name || row.creativename || '',
          ad_set: row.ad_set || row.adset || row.batch || '',
          headline: row.headline || '',
          primary_text: row.primary_text || row.primarytext || '',
          budget: row.budget || '20',
          matchedCreative: matchCreative(row.creative_name || row.creativename || '', readyCreatives),
        }));
        setParsedRows(mapped);
      };
      reader.readAsText(file);
    },
    [readyCreatives]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateTemplate(readyCreatives);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'creative-launch-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [readyCreatives]);

  const matchedCount = useMemo(() => parsedRows.filter((r) => r.matchedCreative).length, [parsedRows]);
  const unmatchedCount = useMemo(() => parsedRows.filter((r) => !r.matchedCreative).length, [parsedRows]);

  // Group by ad_set to compute batches
  const batchesFromCSV = useMemo(() => {
    const groups = new Map<string, ParsedRow[]>();
    for (const row of parsedRows) {
      if (!row.matchedCreative) continue;
      const key = row.ad_set || 'Batch 1';
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    }
    const batches: CreativeBatch[] = [];
    let idx = 0;
    for (const [name, rows] of groups) {
      idx++;
      batches.push({
        id: `csv-batch-${idx}`,
        name,
        creativeIds: rows.map((r) => r.matchedCreative!.id),
        dailyBudget: rows[0]?.budget ? parseFloat(rows[0].budget) : undefined,
        primaryTexts: rows.filter((r) => r.primary_text).map((r) => r.primary_text),
        headlines: rows.filter((r) => r.headline).map((r) => r.headline),
      });
    }
    return batches;
  }, [parsedRows]);

  const adSetCount = batchesFromCSV.length;

  const handleLaunchFromCSV = useCallback(() => {
    clearBatches();
    for (const batch of batchesFromCSV) {
      createBatch(batch.name, batch.creativeIds);
    }
    if (batchesFromCSV[0]?.dailyBudget) {
      updateLaunchConfig({ dailyBudget: batchesFromCSV[0].dailyBudget });
    }
    onLaunchFromCSV?.(batchesFromCSV);
    setLaunchCenterTab('grid');
  }, [batchesFromCSV, clearBatches, createBatch, updateLaunchConfig, onLaunchFromCSV, setLaunchCenterTab]);

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-10 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
          dragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        )}
      >
        <Upload className={cn('w-8 h-8', dragActive ? 'text-blue-500' : 'text-gray-400')} />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {fileName ? fileName : 'Drop CSV here or click to upload'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Columns: creative_name, ad_set, headline, primary_text, budget
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Download template */}
      <button
        onClick={handleDownloadTemplate}
        className="flex items-center gap-2 self-start px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Download className="w-4 h-4" />
        Download Template ({readyCreatives.length} creatives)
      </button>

      {/* Preview table */}
      {parsedRows.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <FileSpreadsheet className="w-4 h-4" />
            Preview
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-[280px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Creative
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Ad Set
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Headline
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Budget
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {parsedRows.map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'hover:bg-gray-50 dark:hover:bg-gray-800/30',
                      !row.matchedCreative && 'bg-red-50/50 dark:bg-red-900/10'
                    )}
                  >
                    <td className="px-3 py-2 w-8">
                      {row.matchedCreative ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[180px] truncate">
                      {row.creative_name}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.ad_set}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[180px] truncate">
                      {row.headline}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                      ${row.budget}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="text-green-600 dark:text-green-400 font-medium">{matchedCount} ads</span>
              {' across '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{adSetCount} ad sets</span>
              {unmatchedCount > 0 && (
                <>
                  {' | '}
                  <span className="text-red-500 font-medium">{unmatchedCount} unmatched</span>
                </>
              )}
            </div>
            <button
              onClick={handleLaunchFromCSV}
              disabled={matchedCount === 0}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                matchedCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              )}
            >
              <Zap className="w-4 h-4" />
              Launch from CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
