export type FunnelStage = 'acquisition' | 'retargeting' | 'retention';

export interface FunnelStageConfig {
  stage: FunnelStage;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const funnelStages: FunnelStageConfig[] = [
  { stage: 'acquisition', label: 'Acquisition', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { stage: 'retargeting', label: 'Retargeting', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  { stage: 'retention', label: 'Retention', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
];

// Map campaign objectives to funnel stages
export const objectiveToFunnel: Record<string, FunnelStage> = {
  CONVERSIONS: 'acquisition',
  TRAFFIC: 'acquisition',
  REACH: 'acquisition',
  ENGAGEMENT: 'retargeting',
  APP_INSTALLS: 'acquisition',
  VIDEO_VIEWS: 'retargeting',
  LEAD_GENERATION: 'acquisition',
  BRAND_AWARENESS: 'retention',
};
