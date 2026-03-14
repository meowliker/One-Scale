'use client';

import { Database } from 'lucide-react';

export default function DataPage() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Database className="w-12 h-12 text-text-muted" />
      <p className="text-lg font-medium text-text-secondary">Data Management</p>
      <p className="text-sm text-text-muted">Coming soon</p>
    </div>
  );
}
