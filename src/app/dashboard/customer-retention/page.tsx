'use client';

import { Users } from 'lucide-react';

export default function CustomerRetentionPage() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Users className="w-12 h-12 text-text-muted" />
      <p className="text-lg font-medium text-text-secondary">Customer Retention</p>
      <p className="text-sm text-text-muted">Coming soon</p>
    </div>
  );
}
