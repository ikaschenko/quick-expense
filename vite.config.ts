import { realpathSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: realpathSync.native(process.cwd()),
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      // Admin log viewer is served by the backend, not the SPA — proxy it too.
      "/logs": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks",
    server: { deps: { inline: ["pg"] } },
    exclude: [...configDefaults.exclude, "tests/**/*.integration.test.*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
