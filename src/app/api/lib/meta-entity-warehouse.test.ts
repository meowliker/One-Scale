import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWarehouseVariantKey,
  buildEnrichmentLookups,
  mergeEnrichment,
  normalizeMetaAccountId,
  resolveEnrichmentForAccount,
} from './meta-entity-warehouse-utils.ts';

test('normalizeMetaAccountId strips act_ prefix', () => {
  assert.equal(normalizeMetaAccountId('act_123456'), '123456');
  assert.equal(normalizeMetaAccountId('123456'), '123456');
  assert.equal(normalizeMetaAccountId(''), '');
});

test('buildWarehouseVariantKey includes since/until strict window', () => {
  const key = buildWarehouseVariantKey('2026-03-01', '2026-03-30');
  assert.equal(key, 'warehouse:since:2026-03-01|until:2026-03-30|strict:1');
});

test('enrichment falls back to account setup data and allows explicit overrides', () => {
  const lookups = buildEnrichmentLookups(
    [{
      id: 'act_111',
      name: 'Main Account',
      businessId: 'bm_1',
      businessName: 'Main BM',
    }],
    [{
      id: 'pg_1',
      name: 'Main Page',
      instagramId: 'ig_1',
      instagramUsername: 'brand_ig',
      adAccountIds: ['act_111'],
    }],
    [{
      id: 'px_1',
      name: 'Main Pixel',
      adAccountId: 'act_111',
    }],
    [{
      id: 'ig_1',
      name: 'Brand IG',
      username: 'brand_ig',
      adAccountIds: ['act_111'],
    }],
    [{
      ad_account_id: 'act_111',
      ad_account_name: 'Main Account',
      timezone: 'America/New_York',
    }]
  );

  const accountOnly = resolveEnrichmentForAccount('act_111', lookups);
  assert.equal(accountOnly.adAccountId, '111');
  assert.equal(accountOnly.businessManagerId, 'bm_1');
  assert.equal(accountOnly.facebookPageId, 'pg_1');
  assert.equal(accountOnly.pixelId, 'px_1');

  const overridden = mergeEnrichment(accountOnly, {
    facebookPageId: 'pg_override',
    facebookPageName: 'Override Page',
  });

  assert.equal(overridden.facebookPageId, 'pg_override');
  assert.equal(overridden.facebookPageName, 'Override Page');
  assert.equal(overridden.pixelId, 'px_1');
});
