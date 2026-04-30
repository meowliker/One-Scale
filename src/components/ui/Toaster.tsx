'use client';

import { Toaster as HotToaster } from 'react-hot-toast';

export function Toaster() {
  return (
    <HotToaster
      position="top-right"
      toastOptions={{
        style: {
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-elevated)',
          color: 'var(--color-text-primary)',
          boxShadow: 'var(--shadow-md)',
          fontSize: '13px',
        },
      }}
    />
  );
}
