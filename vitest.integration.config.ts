import { readFileSync } from "node:fs";
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
      env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const dotenvVars = loadDotenv();

export default defineConfig({
  test: {
    globals: true,
    pool: "forks",
    include: ["tests/*.integration.test.*"],
    env: dotenvVars,
  },
});
