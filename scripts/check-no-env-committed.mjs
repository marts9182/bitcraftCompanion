#!/usr/bin/env node
// Blocks committing any .env* file except .env.example.
// Cross-platform (no binary required) so the critical guard always runs.
import { execSync } from "node:child_process";

const staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
  encoding: "utf8",
})
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const offenders = staged.filter((f) => {
  const base = f.split("/").pop() ?? f;
  return base.startsWith(".env") && base !== ".env.example";
});

if (offenders.length > 0) {
  console.error("\n✖ Refusing to commit env file(s) that may contain secrets:");
  for (const f of offenders) console.error(`  - ${f}`);
  console.error("\nOnly .env.example may be committed. Remove these from the commit.\n");
  process.exit(1);
}
