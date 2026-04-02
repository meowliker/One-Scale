'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  Check,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  TestTube2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatClickUpFieldValue,
  getClickUpFieldHref,
} from '@/lib/creative-hub/clickupFieldFormatting';
import { getPreviewUrl, isVideoCreative } from '@/components/creative-hub/launch-center/CreativeLaunchStudioSelectionPanels';
import {
  type AiTab,
  type SelectionDiagnostics,
  getAiModeLabel,
  getStrategyLabel,
  SectionCard,
  truncate,
} from '@/components/creative-hub/launch-center/CreativeLaunchStudioShared';
import type { AIInsightsData, BatchStrategy, InboxCreative } from '@/types/creativeHub';

export function AiStrategistPanel({
  storeId,
  productId,
  selectedCreatives,
  focusedCreative,
  diagnostics,
  aiAnalysis,
  aiChat,
  fetchAnalysis,
  sendChat,
  onApplyStrategy,
}: {
  storeId: string;
  productId: string | null;
  selectedCreatives: InboxCreative[];
  focusedCreative: InboxCreative | null;
  diagnostics: SelectionDiagnostics;
  aiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  aiChat: {
    messages: Array<{ role: 'user' | 'assistant'; content: string; actionItems?: string[] }>;
    loading: boolean;
    meta?: {
      mode?: string;
      model?: string;
      toolCalls?: number;
      apiKeySource?: string;
      selectionAware?: boolean;
      degradedReason?: string;
    };
  };
  fetchAnalysis: (storeId: string, productProfileId: string) => Promise<void>;
  sendChat: (storeId: string, productProfileId: string, message: string) => Promise<void>;
  onApplyStrategy: (strategy: BatchStrategy, size: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<AiTab>('brief');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const selectionKey = useMemo(
    () => selectedCreatives.map((creative) => creative.id).sort().join('|') || 'none',
    [selectedCreatives],
  );

  useEffect(() => {
    if (
      productId &&
      storeId &&
      !aiAnalysis.loading &&
      !aiAnalysis.error &&
      (!aiAnalysis.data || (aiAnalysis.data.meta?.selectionKey || 'none') !== selectionKey)
    ) {
      void fetchAnalysis(storeId, productId);
    }
  }, [productId, storeId, aiAnalysis.data, aiAnalysis.error, aiAnalysis.loading, fetchAnalysis, selectionKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat.messages]);

  const strategyMeta = aiAnalysis.data?.meta;
  const effectiveSelectionPlan = useMemo(
    () =>
      aiAnalysis.data?.selectionPlan || {
        selectedCount: selectedCreatives.length,
        testedCount: selectedCreatives.filter((creative) => creative.alreadyTested).length,
        winnerCount: selectedCreatives.filter((creative) => creative.pastTestResult?.status === 'winner').length,
        untestedCount: selectedCreatives.filter((creative) => !creative.alreadyTested).length,
        uniqueAngles: diagnostics.uniqueAngles,
        uniqueHooks: diagnostics.uniqueHooks,
        uniqueCreators: diagnostics.uniqueCreators,
        uniqueFolders: diagnostics.uniqueFolders,
        uniqueFormats: diagnostics.uniqueFormats,
        recommendedStrategy: diagnostics.recommendedStrategy,
        recommendedSize: diagnostics.recommendedSize,
        title: diagnostics.title,
        reason: diagnostics.reason,
        strengths: diagnostics.strengths,
        cautions: diagnostics.warnings,
        nextMoves: [
          diagnostics.recommendedStrategy === 'one_per_adset'
            ? 'Start with one creative per ad set before mixing multiple variables.'
            : `Apply a ${getStrategyLabel(diagnostics.recommendedStrategy).toLowerCase()} structure before launch.`,
          diagnostics.uniqueHooks > 1 || diagnostics.uniqueAngles > 1
            ? 'Keep each lane focused on one obvious hook or angle question.'
            : 'Add one sharper challenger concept before expanding spend.',
          selectedCreatives.some((creative) => creative.pastTestResult?.status === 'winner')
            ? 'Hold your winner aside as control and do not bury it inside a large mix.'
            : 'Pick a clear control asset so the first launch has a stable benchmark.',
        ],
      },
    [aiAnalysis.data?.selectionPlan, diagnostics, selectedCreatives],
  );
  const historySummary = aiAnalysis.data?.insights;
  const historyModeLabel = getAiModeLabel(strategyMeta?.mode);
  const chatModeLabel = getAiModeLabel(aiChat.meta?.mode);
  const avoidMixingMessage =
    effectiveSelectionPlan.cautions[0] ||
    'No obvious mix conflict surfaced. Keep the first lane focused on one main question.';
  const nextActionMessage =
    effectiveSelectionPlan.nextMoves[0] ||
    'Move into review after you lock the first lane structure.';
  const quickPrompts = useMemo(
    () => [
      selectedCreatives.length > 0
        ? `Build me the cleanest test plan for these ${selectedCreatives.length} selected creatives.`
        : 'What is the best next creative test for this product?',
      focusedCreative
        ? `How would a media buyer position "${truncate(focusedCreative.creativeName, 40)}" against the rest of the set?`
        : 'What should I avoid testing together in the same batch?',
      'Give me a winner-plus-challengers batch structure',
    ],
    [focusedCreative, selectedCreatives.length],
  );

  const handleSend = useCallback(() => {
    if (!productId || !chatInput.trim()) return;
    void sendChat(storeId, productId, chatInput.trim());
    setChatInput('');
  }, [chatInput, productId, sendChat, storeId]);

  return (
    <SectionCard
      title="AI Strategist"
      action={
        <button
          onClick={() => {
            if (productId) {
              void fetchAnalysis(storeId, productId);
            }
          }}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          Refresh brief
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[24px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#1d4ed8_100%)] p-4 text-white shadow-[0_18px_40px_rgba(30,64,175,0.22)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/12 p-2.5">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Selected set + market context</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {selectedCreatives.length > 0
                  ? `${selectedCreatives.length} assets ready for a buyer-grade launch plan`
                  : 'Analyzing this product for the next best test'}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-100/90">
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              Focus
              <p className="mt-1 text-sm font-semibold text-white">{focusedCreative?.creativeName || 'All assets'}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              Selected
              <p className="mt-1 text-sm font-semibold text-white">{selectedCreatives.length} creatives</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('brief')}
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all',
              activeTab === 'brief' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            Strategy brief
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all',
              activeTab === 'chat' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            Ask Claude
          </button>
        </div>

        {activeTab === 'brief' ? (
          <div className="space-y-4">
            {aiAnalysis.loading && (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                Building a selection-aware plan from product history and the current asset set...
              </div>
            )}
            {aiAnalysis.error && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{aiAnalysis.error}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{historyModeLabel}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{aiAnalysis.data?.source || 'fallback'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{aiAnalysis.data?.model || 'rule-based'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{aiAnalysis.data?.analyzedAds || 0} ads analyzed</span>
              {strategyMeta?.selectionAware && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Selection-aware</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Best first structure</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{getStrategyLabel(effectiveSelectionPlan.recommendedStrategy)}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{effectiveSelectionPlan.reason}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Keep separate</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Do not muddy the first read</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{avoidMixingMessage}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next move</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">What to do now</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{nextActionMessage}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selected-set plan</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{effectiveSelectionPlan.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{effectiveSelectionPlan.reason}</p>
                </div>
                <button
                  onClick={() => onApplyStrategy(effectiveSelectionPlan.recommendedStrategy, effectiveSelectionPlan.recommendedSize)}
                  disabled={selectedCreatives.length === 0}
                  className={cn('rounded-full px-3 py-2 text-xs font-semibold transition-all', selectedCreatives.length > 0 ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400')}
                >
                  Apply {getStrategyLabel(effectiveSelectionPlan.recommendedStrategy)}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-2xl bg-slate-50 px-3 py-2"><p className="text-slate-500">Creatives</p><p className="mt-1 text-sm font-semibold text-slate-900">{effectiveSelectionPlan.selectedCount}</p></div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2"><p className="text-slate-500">Untested</p><p className="mt-1 text-sm font-semibold text-slate-900">{effectiveSelectionPlan.untestedCount}</p></div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2"><p className="text-slate-500">Hooks</p><p className="mt-1 text-sm font-semibold text-slate-900">{effectiveSelectionPlan.uniqueHooks}</p></div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2"><p className="text-slate-500">Formats</p><p className="mt-1 text-sm font-semibold text-slate-900">{effectiveSelectionPlan.uniqueFormats}</p></div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Strengths</p>
                  <div className="mt-2 space-y-2">
                    {(effectiveSelectionPlan.strengths.length > 0 ? effectiveSelectionPlan.strengths : ['No major strengths surfaced yet.']).map((item) => (
                      <div key={item} className="flex gap-2 text-xs text-emerald-800"><Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><p>{item}</p></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Watch-outs</p>
                  <div className="mt-2 space-y-2">
                    {(effectiveSelectionPlan.cautions.length > 0 ? effectiveSelectionPlan.cautions : ['No major structural risk called out for this selection.']).map((item) => (
                      <div key={item} className="flex gap-2 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><p>{item}</p></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next moves</p>
                <div className="mt-2 space-y-2">
                  {effectiveSelectionPlan.nextMoves.slice(0, 3).map((item) => (
                    <div key={item} className="flex gap-2 text-sm text-slate-700"><TestTube2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" /><p>{item}</p></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <BarChart3 className="h-3.5 w-3.5" />
                Meta history
              </div>
              {historySummary ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{historySummary.summary}</p>
                  {aiAnalysis.data?.analyzedAds === 0 && (
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      No winning Meta ads were available for this product yet, so the brief above is leaning on the selected creatives more than historical winners.
                    </div>
                  )}
                  {historySummary.winningPatterns.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {historySummary.winningPatterns.slice(0, 3).map((pattern, index) => (
                        <div key={`${pattern.pattern}-${index}`} className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">{pattern.pattern}</p>
                          <p className="mt-1 text-xs text-slate-600">{pattern.avgRoas.toFixed(1)}x avg ROAS</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{pattern.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    {historySummary.actionItems.slice(0, 4).map((item, index) => (
                      <div key={`${item}-${index}`} className="flex gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                        <p>{item}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Refresh the brief to pull market history for this product.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{chatModeLabel}</span>
              {aiChat.meta?.model && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{aiChat.meta.model}</span>}
              {typeof aiChat.meta?.toolCalls === 'number' && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{aiChat.meta.toolCalls} tool call{aiChat.meta.toolCalls === 1 ? '' : 's'}</span>}
              {aiChat.meta?.selectionAware && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Selection-aware</span>}
            </div>
            {aiChat.meta?.degradedReason && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Claude is temporarily unavailable, so this answer is using the built-in planner. {aiChat.meta.degradedReason}
              </div>
            )}
            <div className="space-y-2">
              {aiChat.messages.length === 0 && (
                <div className="space-y-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      disabled={aiChat.loading}
                      onClick={() => {
                        setChatInput(prompt);
                        if (productId) {
                          void sendChat(storeId, productId, prompt);
                        }
                      }}
                      className={cn('w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition', aiChat.loading ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-50')}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
                {aiChat.messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn('rounded-2xl px-4 py-3 text-sm leading-6', message.role === 'user' ? 'ml-8 bg-slate-900 text-white' : 'mr-5 border border-slate-200 bg-white text-slate-700')}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.actionItems && message.actionItems.length > 0 && (
                      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                        {message.actionItems.map((item) => (
                          <p key={item} className="text-xs text-slate-500">{item}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {aiChat.loading && (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    Thinking through the test plan...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask Claude how to structure this selected test..."
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
              <button
                onClick={handleSend}
                disabled={!chatInput.trim() || aiChat.loading || !productId}
                className={cn('rounded-2xl px-4 py-3 text-sm font-semibold transition-all', chatInput.trim() && !aiChat.loading && productId ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400')}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export function PreviewModal({
  creative,
  onClose,
}: {
  creative: InboxCreative;
  onClose: () => void;
}) {
  const previewUrl = getPreviewUrl(creative);
  const hasVideo = isVideoCreative(creative);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-6 py-10 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Full Preview</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{creative.creativeName}</h3>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2.5 text-slate-700 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-0 items-center justify-center bg-slate-950 p-6">
            {previewUrl ? (
              hasVideo ? (
                <video src={previewUrl} controls playsInline className="max-h-full max-w-full rounded-[24px] bg-black" />
              ) : (
                <img src={previewUrl} alt={creative.creativeName} className="max-h-full max-w-full rounded-[24px] object-contain" />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">No preview available</div>
            )}
          </div>
          <div className="overflow-y-auto border-l border-slate-200 bg-slate-50 p-6">
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Task</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{creative.clickupTaskName}</p>
                <p className="mt-1 text-sm text-slate-600">{creative.driveParentFolderName || creative.clickupListName || 'Creative source'}</p>
              </div>
              {creative.clickupDescription && (
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Description</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{creative.clickupDescription}</p>
                </div>
              )}
              {creative.clickupCustomFields && creative.clickupCustomFields.length > 0 && (
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Custom fields</p>
                  <div className="mt-3 space-y-2">
                    {creative.clickupCustomFields.map((field) => (
                      <div key={field.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{field.name}</p>
                        {getClickUpFieldHref(field) ? (
                          <a
                            href={getClickUpFieldHref(field) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 break-all text-sm text-blue-700 hover:text-blue-800 hover:underline"
                          >
                            {formatClickUpFieldValue(field)}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <p className="mt-1 text-sm text-slate-700">{formatClickUpFieldValue(field)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
