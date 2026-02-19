#!/usr/bin/env node

const args = process.argv.slice(2);
const options = Object.fromEntries(
  args
    .map((arg) => {
      const m = arg.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : null;
    })
    .filter(Boolean)
);

const baseUrl = options.url || process.env.TEST_BASE_URL || 'http://localhost:3000';
const storeId = options.store || process.env.TEST_STORE_ID;
const datePreset = options.datePreset || process.env.TEST_DATE_PRESET || 'last_30d';
const maxSeconds = Number(options.maxSeconds || process.env.TEST_MAX_SECONDS || '60');

if (!storeId) {
  console.error('Missing store id. Use --store=<storeId> or TEST_STORE_ID.');
  process.exit(2);
}

const url = new URL('/api/meta/creatives', baseUrl);
url.searchParams.set('storeId', storeId);
url.searchParams.set('datePreset', datePreset);
url.searchParams.set('debug', '1');

const controller = new AbortController();
const hardTimeoutMs = Math.max(65000, (maxSeconds + 5) * 1000);
const timeoutId = setTimeout(() => controller.abort(), hardTimeoutMs);

const started = Date.now();

try {
  const response = await fetch(url, { signal: controller.signal });
  const payload = await response.json();
  const elapsedMs = Date.now() - started;

  if (!response.ok) {
    console.error(`Creative API failed: ${response.status}`, payload);
    process.exit(1);
  }

  const metaElapsed = payload?.meta?.elapsedMs;
  const creativeCount = Array.isArray(payload?.data) ? payload.data.length : 0;
  const secs = (elapsedMs / 1000).toFixed(1);
  const metaSecs = typeof metaElapsed === 'number' ? (metaElapsed / 1000).toFixed(1) : 'n/a';

  console.log(`Creative load test`);
  console.log(`URL: ${url.toString()}`);
  console.log(`HTTP elapsed: ${secs}s`);
  console.log(`Server elapsed: ${metaSecs}s`);
  console.log(`Creatives: ${creativeCount}`);

  if (elapsedMs > maxSeconds * 1000) {
    console.error(`FAILED: exceeded ${maxSeconds}s target`);
    process.exit(1);
  }

  console.log(`PASSED: under ${maxSeconds}s`);
  process.exit(0);
} catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    console.error(`FAILED: request timed out after ${(hardTimeoutMs / 1000).toFixed(0)}s`);
  } else {
    console.error('FAILED:', err);
  }
  process.exit(1);
} finally {
  clearTimeout(timeoutId);
}
