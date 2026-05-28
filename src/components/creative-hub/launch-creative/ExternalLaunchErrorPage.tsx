'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export interface ExternalLaunchIssue {
  title: string;
  message: string;
  details: Array<{ label: string; value: string | string[] }>;
}

interface ExternalLaunchErrorPageProps {
  issue: ExternalLaunchIssue;
}

export function ExternalLaunchErrorPage({ issue }: ExternalLaunchErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <section className="w-full max-w-3xl rounded-[1.5rem] border border-red-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">
              Link Error
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              {issue.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {issue.message}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Link details
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {issue.details.map((detail) => (
              <div key={detail.label} className="rounded-xl border border-slate-200 bg-white p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {detail.label}
                </dt>
                <dd className="mt-1 break-words font-medium text-slate-800">
                  {Array.isArray(detail.value) ? (
                    detail.value.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5">
                        {detail.value.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      '-'
                    )
                  ) : (
                    detail.value || '-'
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/creative-hub"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 hover:!text-white"
          >
            Launch Creatives Using OneScale
          </Link>
        </div>
      </section>
    </main>
  );
}
