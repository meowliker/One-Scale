export const ACCOUNT_ONLY_CAMPAIGN_TYPE = 'account';
export const ACCOUNT_ONLY_CAMPAIGN_PREFIX = '__account__:';

export function normalizeAccountOnlyAdAccountId(value?: string | null): string {
  return (value || '').trim().replace(/^act_/, '');
}

export function buildAccountOnlyCampaignId(adAccountId: string): string {
  const normalized = normalizeAccountOnlyAdAccountId(adAccountId);
  return `${ACCOUNT_ONLY_CAMPAIGN_PREFIX}${normalized || adAccountId.trim()}`;
}

export function isAccountOnlyCampaignLink(link: { campaignType?: string | null; campaignId?: string | null }): boolean {
  return (
    link.campaignType === ACCOUNT_ONLY_CAMPAIGN_TYPE ||
    Boolean(link.campaignId?.startsWith(ACCOUNT_ONLY_CAMPAIGN_PREFIX))
  );
}
