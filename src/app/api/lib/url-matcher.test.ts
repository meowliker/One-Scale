import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUrlSimilarity, matchProductsToAds } from './url-matcher.ts';

test('calculateUrlSimilarity returns 100 for exact product handle path', () => {
  const score = calculateUrlSimilarity(
    'https://mindingart.com/products/kids-life-skills',
    'https://mindingart.com/products/kids-life-skills?utm_source=fb'
  );
  assert.equal(score, 100);
});

test('matchProductsToAds matches strict handle path and ignores unmatched handles', () => {
  const matches = matchProductsToAds(
    [
      {
        productId: 'p1',
        productName: 'Kids Life Skills',
        url: 'https://mindingart.com/products/kids-life-skills',
        handle: 'kids-life-skills',
      },
    ],
    [
      {
        campaignId: 'c1',
        campaignName: 'Campaign 1',
        adAccountId: 'act_1',
        adId: 'a1',
        adName: 'Ad 1',
        url: 'https://mindingart.com/products/kids-life-skills?utm=1',
      },
      {
        campaignId: 'c2',
        campaignName: 'Campaign 2',
        adAccountId: 'act_2',
        adId: 'a2',
        adName: 'Ad 2',
        url: 'https://mindingart.com/products/another-product',
      },
    ],
    70
  );

  const match = matches.get('p1');
  assert.ok(match);
  assert.equal(match?.matchedCampaignId, 'c1');
  assert.equal(match?.matchScore, 100);
});
