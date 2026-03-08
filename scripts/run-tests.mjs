import { spawn } from "node:child_process";

const hasStoreId = Boolean(process.env.TEST_STORE_ID);

if (!hasStoreId) {
  console.log("Skipping integration test: set TEST_STORE_ID to run test:creative-load.");
  process.exit(0);
}

const proc = spawn("node", ["scripts/test-creative-load.mjs"], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

proc.on("exit", (code) => {
  process.exit(code ?? 1);
});
