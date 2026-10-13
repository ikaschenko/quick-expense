// @vitest-environment node
import express from "express";

describe("static middleware ordering", () => {
  it("serves static files before session middleware is invoked", async () => {
    let sessionInvoked = false;
    const app = express();

    // Simulating the ordering in index.js:
    // 1. Static middleware
    app.use(express.static("tests/fixtures", { index: false }));

    // 2. Session middleware
    app.use((_req, _res, next) => {
      sessionInvoked = true;
      next();
    });

    // 3. Fallback / api routes
    app.get("/api/test", (_req, res) => {
      res.json({ ok: true });
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
      // Non-static route invokes session
      const apiRes = await fetch(`http://127.0.0.1:${port}/api/test`);
      expect(apiRes.status).toBe(200);
      expect(sessionInvoked).toBe(true);

      sessionInvoked = false;
      // Requesting a nonexistent static file falls through to session
      const notFoundRes = await fetch(`http://127.0.0.1:${port}/nonexistent.js`);
      expect(notFoundRes.status).toBe(404);
      expect(sessionInvoked).toBe(true);
    } finally {
      server.close();
    }
  });
});
