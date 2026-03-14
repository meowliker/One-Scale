'use client';

import { HelpCircle } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <HelpCircle className="w-12 h-12 text-text-muted" />
      <p className="text-lg font-medium text-text-secondary">Help & Documentation</p>
      <p className="text-sm text-text-muted">Coming soon</p>
    </div>
  );
}
