import { Loader2 } from 'lucide-react';
import type { AIInsightsData, InboxCreative, WinningAdsData } from '@/types/creativeHub';

export function SelectionAiContextPanel({
  creative,
  selectedCreatives,
  aiAnalysis,
  winningAds,
}: {
  creative: InboxCreative | null;
  selectedCreatives: InboxCreative[];
  aiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  winningAds: WinningAdsData | null;
}) {
  const launchDraft = aiAnalysis.data?.launchDraft;
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          AI input context
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-emerald-700">
            {selectedCreatives.length} selected creatives
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-emerald-700">
            {selectedCreatives.filter((item) => Boolean(item.clickupDescription?.trim())).length} ClickUp descriptions
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-emerald-700">
            {selectedCreatives.reduce((sum, item) => sum + (item.clickupCustomFields?.length || 0), 0)} custom fields
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-emerald-700">
            ROAS floor {launchDraft?.profitabilityFloor?.toFixed(1) || '1.2'}x
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-emerald-800">
          The AI planner sees the ClickUp description, task name, custom fields, tags, uploaded date, Drive lineage, and winner history for the selected creatives before it drafts the batch plan.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current AI brief
          </p>
          {aiAnalysis.loading ? (
            <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              Building the draft from selected creatives and winner history...
            </div>
          ) : aiAnalysis.error ? (
            <div className="mt-4 rounded-[18px] bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {aiAnalysis.error}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm leading-6 text-slate-700">
                {launchDraft?.summary || aiAnalysis.data?.insights.summary || 'Refresh the AI brief once you have the selection you want to test.'}
              </p>
              {(launchDraft?.actionCards || []).slice(0, 3).map((card) => (
                <div key={card.id} className="rounded-[18px] bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{card.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Winner context
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Primary texts</p>
              <p className="mt-2 text-sm text-slate-700">
                {winningAds?.autoFill.primaryTexts.slice(0, 2).join(' • ') || 'No winner copy available yet'}
              </p>
            </div>
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Headlines</p>
              <p className="mt-2 text-sm text-slate-700">
                {winningAds?.autoFill.headlines.slice(0, 2).join(' • ') || 'No winning headlines available yet'}
              </p>
            </div>
            {creative ? (
              <div className="rounded-[18px] bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Focused task</p>
                <p className="mt-2 text-sm text-slate-700">{creative.clickupTaskName}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
