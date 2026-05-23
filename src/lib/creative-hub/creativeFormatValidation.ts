import type { CreativeFormatMode, LaunchConfig } from '@/types/creativeHub';

const DEFAULT_CREATIVE_FORMAT_MODE: CreativeFormatMode = 'single_per_creative';

type CopyBucket = LaunchConfig['primaryTexts'];

export interface CreativeFormatValidationResult {
  mode: CreativeFormatMode;
  errors: string[];
  warnings: string[];
}

function normalizeCreativeFormatMode(value?: string | null): CreativeFormatMode {
  if (
    value === 'single_per_creative' ||
    value === 'single_format_media_options' ||
    value === 'dynamic_creative' ||
    value === 'carousel'
  ) {
    return value;
  }
  return DEFAULT_CREATIVE_FORMAT_MODE;
}

function uniqueCopyCount(items: CopyBucket | undefined): number {
  return new Set(
    (items || [])
      .map((item) => item.text.trim())
      .filter(Boolean),
  ).size;
}

export function isLaunchCreativeFormatModeEnabled(mode: CreativeFormatMode): boolean {
  if (mode === 'single_per_creative') return true;
  if (mode === 'single_format_media_options') {
    return false;
  }
  if (mode === 'dynamic_creative') {
    return (
      process.env.NEXT_PUBLIC_CREATIVE_HUB_ENABLE_DYNAMIC_CREATIVE_FORMAT === 'true' ||
      process.env.CREATIVE_HUB_ENABLE_DYNAMIC_CREATIVE_FORMAT === 'true'
    );
  }
  return false;
}

function getAssignedLaneSizes(config: Partial<LaunchConfig>): number[] {
  const mediaOptionCreativeIds = config.mediaOptionCreativeIds || {};
  const selectedCreativeIds = config.selectedCreativeIds || [];
  if (selectedCreativeIds.length > 0) {
    return selectedCreativeIds
      .map((creativeId) => {
        const selectedMediaIds = mediaOptionCreativeIds[creativeId];
        return (selectedMediaIds && selectedMediaIds.length > 0 ? selectedMediaIds : [creativeId])
          .filter(Boolean)
          .length;
      });
  }
  const mediaOptionLaneSizes = Object.values(mediaOptionCreativeIds)
    .map((ids) => (ids || []).filter(Boolean).length)
    .filter((count) => count > 0);
  if (mediaOptionLaneSizes.length > 0) return mediaOptionLaneSizes;
  return [(config.selectedCreativeIds || []).filter(Boolean).length].filter((count) => count > 0);
}

function copyOptionErrors(config: Partial<LaunchConfig>): string[] {
  const issues: string[] = [];
  const primaryTextCount = uniqueCopyCount(config.primaryTexts);
  const headlineCount = uniqueCopyCount(config.headlines);
  const descriptionCount = uniqueCopyCount(config.descriptions);

  if (primaryTextCount > 1) {
    issues.push(`Primary text has ${primaryTextCount} selected options`);
  }
  if (headlineCount > 1) {
    issues.push(`Headline has ${headlineCount} selected options`);
  }
  if (descriptionCount > 1) {
    issues.push(`Description has ${descriptionCount} selected options`);
  }

  return issues;
}

export function validateLaunchCreativeFormat(
  config: Partial<LaunchConfig>,
): CreativeFormatValidationResult {
  const mode = normalizeCreativeFormatMode(config.creativeFormatMode);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isLaunchCreativeFormatModeEnabled(mode)) {
    errors.push(
      `${formatModeLabel(mode)} is visible in setup, but its Meta payload is not launch-enabled yet. Use Single ad per creative for this launch.`,
    );
  }

  if (mode === 'single_per_creative') {
    const copyIssues = copyOptionErrors(config);
    if (copyIssues.length > 0) {
      errors.push(
        `Single ad per creative can only launch one primary text, one headline, and one description with the current stable payload. ${copyIssues.join('; ')}. Deselect extra copy options until the media-options or dynamic-creative backend is enabled.`,
      );
    }
  }

  if (mode === 'single_format_media_options') {
    errors.push(
      'Single ad with media options is not launch-enabled because Meta rejects this Ads Manager-only format through the public API on this account. Use Dynamic creative for multiple media in one launch.',
    );

    if (config.adsetMode === 'existing_adsets') {
      errors.push('Single ad with media options must create new ad sets until the preflight step confirms an existing ad set accepts the payload.');
    }

    const laneSizes = getAssignedLaneSizes(config);
    if (laneSizes.length === 0) {
      errors.push('Single ad with media options needs at least one selected ad with media assigned.');
    }
    const tooSmall = laneSizes.filter((count) => count < 2).length;
    const tooLarge = laneSizes.filter((count) => count > 10).length;
    if (tooSmall > 0) {
      errors.push('Single ad with media options needs at least two media assets for each selected ad.');
    }
    if (tooLarge > 0) {
      errors.push('Single ad with media options supports up to ten media assets for each selected ad.');
    }
  }

  if (mode === 'dynamic_creative' && config.adsetMode === 'existing_adsets') {
    errors.push('Dynamic creative requires creating a new dynamic creative ad set. It cannot be launched into an existing non-dynamic ad set.');
  }

  if (mode === 'dynamic_creative') {
    const laneSizes = getAssignedLaneSizes(config);
    if (laneSizes.length === 0) {
      errors.push('Dynamic creative needs at least one ad-set lane with media assigned.');
    }
    if (laneSizes.some((count) => count > 10)) {
      errors.push('Dynamic creative supports up to ten media assets in each ad-set lane.');
    }
    const hasMultipleMedia = laneSizes.some((count) => count > 1);
    const hasMultipleCopyOptions =
      uniqueCopyCount(config.primaryTexts) > 1 ||
      uniqueCopyCount(config.headlines) > 1 ||
      uniqueCopyCount(config.descriptions) > 1;
    if (!hasMultipleMedia && !hasMultipleCopyOptions) {
      errors.push('Dynamic creative needs at least two media assets or at least two selected text options.');
    }
  }

  return { mode, errors, warnings };
}

export function formatModeLabel(mode?: string | null): string {
  switch (normalizeCreativeFormatMode(mode)) {
    case 'single_format_media_options':
      return 'Single ad with media options';
    case 'dynamic_creative':
      return 'Dynamic creative';
    case 'carousel':
      return 'Carousel';
    case 'single_per_creative':
    default:
      return 'Single ad per creative';
  }
}
