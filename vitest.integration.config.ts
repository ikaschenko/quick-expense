import { readFileSync, realpathSync } from "node:fs";
import { defineConfig } from "vitest/config";

function loadDotenv(): Record<string, string> {
  try {
    const content = readFileSync(".env", "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replaceAll("\\n", "\n");
      }
      env[key] = value;
    }
    return env;
  } catch (error) {
    // Silent {} here previously masked missing/unreadable .env as "not configured".
    console.warn(`[vitest.integration.config] Could not read .env at ${process.cwd()}:`, error);
    return {};
  }
}

const dotenvVars = loadDotenv();

export default defineConfig({
  root: realpathSync.native(process.cwd()),
  test: {
    globals: true,
    pool: "forks",
    include: ["tests/**/*.integration.test.*"],
    env: dotenvVars,
  },
});
