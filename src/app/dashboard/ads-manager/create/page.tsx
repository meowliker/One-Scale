import { CampaignCreateWizard } from '@/components/campaign-create/CampaignCreateWizard';

export default function CreateCampaignPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <div className="rounded-3xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Create Campaign</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Launch-ready flow with winner-driven autopopulation, AI copy variations, and real Meta publish controls.
        </p>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <CampaignCreateWizard />
      </div>
    </div>
  );
}
