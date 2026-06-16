import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // "server-only" throws when imported outside Next.js; stub it for Vitest
      // so pure-function tests in server-only modules can still run.
      "server-only": path.resolve(__dirname, "vitest-stubs/server-only.ts"),
      // "next/cache" is not available in the Vitest Node runtime; stub it.
      "next/cache": path.resolve(__dirname, "vitest-stubs/next-cache.ts"),
      // "@/" path alias mirrors apps/web/tsconfig.json "paths": { "@/*": ["./*"] }
      "@": path.resolve(__dirname, "apps/web"),
    },
  },
});
