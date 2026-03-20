'use client';

import { CreativeLaunchWizard } from '@/components/creative-launch/CreativeLaunchWizard';

export default function CreativeLaunchPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-purple-50 p-8 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.45)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-blue-200/35 blur-3xl" />
        <h1 className="relative text-3xl font-bold tracking-tight text-slate-900">Launch Creatives</h1>
        <p className="relative mt-2 text-sm text-slate-600">
          Auto-populated from your product performance data. Select creatives, configure targeting, and launch to Meta.
        </p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_24px_70px_-35px_rgba(2,6,23,0.45)]">
        <CreativeLaunchWizard />
      </div>
    </div>
  );
}
