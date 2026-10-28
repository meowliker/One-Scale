import { after } from "next/server";
import { processDiscovery } from "./profit-sheet-discovery";

// The durable claim enforces sequencing and cooldowns. A competing cron simply
// gets an idle result; a timeout leaves a recoverable lease for the next worker.
export function kickProfitSheetDiscovery(storeId: string) {
  after(async () => {
    try {
      await processDiscovery(storeId);
    } catch {
      console.warn("Profit Sheet discovery dispatch deferred to durable worker");
    }
  });
}
