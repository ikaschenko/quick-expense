// @vitest-environment node
import "express-async-errors";
import express from "express";

describe("express-async-errors safety net", () => {
  it("forwards a throw from an async route handler (outside try/catch) to the error middleware instead of hanging", async () => {
    const app = express();
    app.get("/boom", async () => {
      throw new Error("boom");
    });
    app.use((error, req, res, next) => {
      res.status(503).json({ message: error.message });
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/boom`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ message: "boom" });
    } finally {
      server.close();
    }
  });
});
