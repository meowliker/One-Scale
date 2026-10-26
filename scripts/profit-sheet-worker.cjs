// Local durable-queue worker. Hosted deployments use the equivalent Vercel crons.
require("@next/env").loadEnvConfig(process.cwd(), true);
const base = process.env.PROFIT_SHEET_LOCAL_URL || "http://127.0.0.1:3000";
if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET is required");
let lastEnqueue = 0;
async function tick() {
  const enqueue = Date.now() - lastEnqueue >= 30 * 60 * 1000;
  try {
    const res = await fetch(
      `${base}/api/cron/profit-sheet${enqueue ? "?enqueue=1" : ""}`,
      {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(290000),
      },
    );
    const body = await res.json();
    if (!res.ok) console.log("Profit Sheet worker: request failed", res.status);
    else {
      if (enqueue) lastEnqueue = Date.now();
      console.log(
        "Profit Sheet worker:",
        body.idle
          ? "idle"
          : body.ok
            ? "saved " + body.date
            : "day failed " + body.date,
      );
    }
  } catch {
    console.log("Profit Sheet worker: server unavailable; retrying.");
  }
  setTimeout(tick, 15000);
}
tick();

// Separate lane: discovery never holds up the financial-report queue.
async function discoveryTick() {
  try {
    const res = await fetch(`${base}/api/cron/profit-sheet-discovery?enqueue=1`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(290000),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) console.log("Discovery worker: failed; check saved report.");
    else if (!body.idle) console.log("Discovery worker: check saved.");
  } catch { console.log("Discovery worker: server unavailable; retrying."); }
  setTimeout(discoveryTick, 60000);
}
discoveryTick();
