import { describe, it, expect } from "vitest";
import { parseServerEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@h/db?sslmode=require",
  SPACETIME_URI: "wss://example.test",
  SPACETIME_MODULE: "bitcraft",
  SPACETIME_TOKEN: "tok",
  INGESTION_ENABLED: "true",
  SPACETIME_APP_IDENTIFIER: "BitCraftCompanion",
};

describe("parseServerEnv", () => {
  it("parses a valid env and coerces the kill switch to boolean", () => {
    const env = parseServerEnv(base);
    expect(env.INGESTION_ENABLED).toBe(true);
    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("treats INGESTION_ENABLED=false as a disabled kill switch", () => {
    const env = parseServerEnv({ ...base, INGESTION_ENABLED: "false" });
    expect(env.INGESTION_ENABLED).toBe(false);
  });

  it("throws when a required secret is missing", () => {
    const { SPACETIME_TOKEN, ...withoutToken } = base;
    expect(() => parseServerEnv(withoutToken)).toThrow();
  });
});
