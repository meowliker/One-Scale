import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductIdentity } from './product-url-resolver.ts';

const catalog = [
  { id: 1, title: 'Kids Life Skills Kit', handle: 'kids-life-skills-kit' },
  { id: 2, title: 'Mindful Drawing Set', handle: 'mindful-drawing-set' },
];

test('resolveProductIdentity keeps explicit handle and URL', () => {
  const resolved = resolveProductIdentity(
    {
      name: 'Anything',
      shopifyUrl: 'https://mindingart.com/products/kids-life-skills-kit?utm=1',
    },
    { storeDomain: 'mindingart.com', catalog }
  );

  assert.equal(resolved.source, 'explicit');
  assert.equal(resolved.handle, 'kids-life-skills-kit');
  assert.equal(resolved.needsUrlReview, false);
});

test('resolveProductIdentity uses catalog lookup for missing handle', () => {
  const resolved = resolveProductIdentity(
    {
      name: 'Kids Life Skills Kit',
    },
    { storeDomain: 'mindingart.com', catalog, unsureThreshold: 0.85 }
  );

  assert.equal(resolved.source, 'catalog');
  assert.equal(resolved.handle, 'kids-life-skills-kit');
  assert.equal(resolved.needsUrlReview, false);
});

test('resolveProductIdentity marks uncertain catalog matches for review', () => {
  const resolved = resolveProductIdentity(
    {
      name: 'Kids Life Skills',
    },
    { storeDomain: 'mindingart.com', catalog, unsureThreshold: 0.99 }
  );

  assert.equal(resolved.source, 'catalog');
  assert.equal(resolved.needsUrlReview, true);
});

test('resolveProductIdentity falls back without fabricating a product handle', () => {
  const resolved = resolveProductIdentity(
    {
      name: 'Unknown Product Name',
    },
    { storeDomain: 'mindingart.com', catalog: [] }
  );

  assert.equal(resolved.source, 'fallback');
  assert.equal(resolved.needsUrlReview, true);
  assert.equal(resolved.handle, '');
  assert.equal(resolved.shopifyUrl, '');
});
