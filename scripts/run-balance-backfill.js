#!/usr/bin/env node
/**
 * Local Balance Transaction Backfill
 * Runs without Vercel timeout — paginates through ALL Shopify Payments transactions.
 * Reads encrypted tokens from Supabase and decrypts locally.
 *
 * Usage: node scripts/run-balance-backfill.js [storeId]
 * Env: reads from .env.local automatically
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── Load .env.local ─────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_SECRET = process.env.APP_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_SECRET || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── Supabase REST client ────────────────────────────────────
async function rest(path, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

const enc = (v) => encodeURIComponent(v);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Decrypt token ───────────────────────────────────────────
function decryptToken(cipherText) {
  if (!cipherText || !cipherText.startsWith('enc:v1:')) return cipherText;
  if (!ENCRYPTION_SECRET) { console.error('No encryption secret'); return null; }

  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();
    const body = cipherText.slice('enc:v1:'.length);
    const [ivB64, payloadB64, tagB64] = body.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const targetStoreId = process.argv[2];

  // Get stores
  let stores;
  if (targetStoreId) {
    stores = await rest(`/stores?id=eq.${enc(targetStoreId)}&select=id,name`);
  } else {
    stores = await rest('/stores?select=id,name');
  }

  console.log(`Processing ${stores.length} store(s)\n`);

  for (const store of stores) {
    console.log(`\n══ ${store.name} (${store.id}) ══`);

    // Get Shopify connection
    const conns = await rest(
      `/connections?store_id=eq.${enc(store.id)}&platform=eq.shopify&select=access_token,shop_domain`
    );
    const conn = conns?.[0];
    if (!conn?.access_token || !conn?.shop_domain) {
      console.log('  No Shopify connection — skipping');
      continue;
    }

    // Decrypt token
    let token = conn.access_token;
    if (token.startsWith('enc:')) {
      token = decryptToken(token);
      if (!token) { console.log('  Token decryption failed — skipping'); continue; }
      console.log('  Token decrypted successfully');
    }

    // Get cursor
    const progress = await rest(
      `/onboarding_progress?store_id=eq.${enc(store.id)}&select=cursors&limit=1`
    );
    let sinceId = progress?.[0]?.cursors?.balance_txn_since_id || undefined;
    console.log(`  Starting from cursor: ${sinceId || 'beginning'}`);

    let totalFetched = 0;
    let totalCharges = 0;
    let totalRefunds = 0;
    let totalDisputes = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ limit: '250' });
      if (sinceId) params.set('since_id', sinceId);

      const url = `https://${conn.shop_domain}/admin/api/2024-01/shopify_payments/balance/transactions.json?${params}`;
      let res;
      try {
        res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
      } catch (e) {
        console.error(`  Fetch error: ${e.message}`);
        break;
      }

      if (res.status === 404) {
        console.log('  Store does not use Shopify Payments — skipping');
        break;
      }
      if (!res.ok) {
        console.error(`  Shopify API error: ${res.status}`);
        break;
      }

      const data = await res.json();
      const txns = data.transactions ?? [];
      if (txns.length === 0) break;

      for (const txn of txns) {
        const txnType = (txn.type || '').toLowerCase();

        // Upsert balance transaction
        await rest('/shopify_balance_transactions?on_conflict=store_id,transaction_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: store.id,
            transaction_id: String(txn.id),
            type: txnType,
            amount: parseFloat(txn.amount || '0'),
            fee: Math.abs(parseFloat(txn.fee || '0')),
            net: parseFloat(txn.net || '0'),
            currency: txn.currency || 'USD',
            source_order_id: txn.source_order_id ? String(txn.source_order_id) : null,
            source_type: txn.source_type || null,
            processed_at: txn.processed_at,
            payout_id: txn.payout_id ? String(txn.payout_id) : null,
          }),
        }).catch(() => null);

        if (txnType === 'charge') totalCharges++;
        if (txnType === 'refund') {
          totalRefunds++;
          await rest('/shopify_refunds?on_conflict=store_id,transaction_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({
              store_id: store.id,
              transaction_id: String(txn.id),
              order_id: txn.source_order_id ? String(txn.source_order_id) : null,
              amount: Math.abs(parseFloat(txn.amount || '0')),
              fee: Math.abs(parseFloat(txn.fee || '0')),
              currency: txn.currency || 'USD',
              processed_at: txn.processed_at,
            }),
          }).catch(() => null);
        }

        if (txnType === 'dispute') {
          totalDisputes++;
          const net = parseFloat(txn.net || '0');
          await rest('/shopify_chargebacks?on_conflict=store_id,order_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({
              store_id: store.id,
              order_id: txn.source_order_id ? String(txn.source_order_id) : null,
              status: net < 0 ? 'lost' : 'won',
              amount: Math.abs(net),
              net_amount: net,
              currency: txn.currency || 'USD',
              finalized_at: txn.processed_at,
              last_synced_at: new Date().toISOString(),
            }),
          }).catch(() => null);
        }
      }

      totalFetched += txns.length;
      sinceId = String(txns[txns.length - 1].id);

      // Save cursor
      const curr = await rest(`/onboarding_progress?store_id=eq.${enc(store.id)}&select=cursors&limit=1`);
      await rest(`/onboarding_progress?store_id=eq.${enc(store.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          cursors: { ...(curr?.[0]?.cursors || {}), balance_txn_since_id: sinceId },
          last_activity_at: new Date().toISOString(),
        }),
      }).catch(() => null);

      if (totalFetched % 500 === 0) {
        console.log(`  ${totalFetched} transactions (${totalCharges} charges, ${totalRefunds} refunds, ${totalDisputes} disputes)`);
      }

      hasMore = txns.length === 250;

      // Rate limiting
      const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (callLimit) {
        const [used, max] = callLimit.split('/').map(Number);
        if (used >= max - 2) await sleep(2000);
        else await sleep(300);
      }
    }

    console.log(`  DONE: ${totalFetched} total (${totalCharges} charges, ${totalRefunds} refunds, ${totalDisputes} disputes)`);
  }

  console.log('\nAll stores complete');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
