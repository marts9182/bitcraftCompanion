import "dotenv/config";
import { parseServerEnv } from "@bcc/shared";
import { shouldRunIngestion, startIngestion, computeBackoffMs } from "./ingest";

async function main() {
  const env = parseServerEnv();

  if (!shouldRunIngestion(env)) {
    console.warn("[worker] INGESTION_ENABLED=false — kill switch active, exiting without connecting.");
    process.exit(0);
  }

  let attempt = 0;
  const connection = startIngestion(env);

  const shutdown = () => {
    console.log("[worker] shutting down…");
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Minimal reconnect supervisor for the spike.
  setInterval(() => {
    if (!connection.isConnected()) {
      const delay = computeBackoffMs(attempt++);
      console.warn(`[worker] not connected; next supervisor tick uses backoff ${delay}ms`);
    } else {
      attempt = 0;
    }
  }, 5000);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
