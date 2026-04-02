import type { LaunchConfig } from '@/types/creativeHub';

interface LaunchLaneInput {
  id: string;
  creativeIds: string[];
}

export interface LaunchPlanValidationResult {
  lanes: LaunchLaneInput[];
  duplicateIds: string[];
  missingIds: string[];
  unknownIds: string[];
}

function uniqueIds(ids: string[] = []): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function getExplicitLaunchLanes(launchConfig: LaunchConfig): LaunchLaneInput[] {
  if (launchConfig.adsetMode === 'existing_adsets') {
    return Object.entries(launchConfig.existingAdsetAssignments || {})
      .filter(([adsetId, creativeIds]) => Boolean(adsetId) && Array.isArray(creativeIds))
      .map(([adsetId, creativeIds]) => ({
        id: adsetId,
        creativeIds: creativeIds.filter(Boolean),
      }))
      .filter((lane) => lane.creativeIds.length > 0);
  }

  if (launchConfig.batches?.length) {
    return launchConfig.batches
      .map((batch) => ({
        id: batch.id,
        creativeIds: (batch.creativeIds || []).filter(Boolean),
      }))
      .filter((lane) => lane.creativeIds.length > 0);
  }

  return [];
}

export function validateLaunchPlanAssignments(
  launchConfig: LaunchConfig,
): LaunchPlanValidationResult {
  const lanes = getExplicitLaunchLanes(launchConfig);
  const selectedIds = uniqueIds(launchConfig.selectedCreativeIds || []);

  if (lanes.length === 0) {
    return {
      lanes,
      duplicateIds: [],
      missingIds: [],
      unknownIds: [],
    };
  }

  const selectedSet = new Set(selectedIds);
  const usageCount = new Map<string, number>();
  const unknownIds = new Set<string>();

  for (const lane of lanes) {
    for (const creativeId of lane.creativeIds) {
      if (!selectedSet.has(creativeId)) {
        unknownIds.add(creativeId);
      }
      usageCount.set(creativeId, (usageCount.get(creativeId) || 0) + 1);
    }
  }

  const duplicateIds = [...usageCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([creativeId]) => creativeId);

  const missingIds = selectedIds.filter((creativeId) => !usageCount.has(creativeId));

  return {
    lanes,
    duplicateIds,
    missingIds,
    unknownIds: [...unknownIds],
  };
}
