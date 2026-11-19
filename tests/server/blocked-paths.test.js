// @vitest-environment node
import { createBlockedPathGuard, isBlockedPath } from "../../app-server/blocked-paths.js";

describe("isBlockedPath", () => {
  it.each([
    "/.env",
    "/.env.production",
    "/backend/.env",
    "/backend/%%32%65env",
    "/backend/%2eenv",
    "/api/%252eenv",
    "/.git/config",
    "/.aws/credentials",
    "/index.php",
    "/admin/config.PHP",
    "/db.sql",
    "/wp-login.php",
    "/wp-admin/",
    "/phpmyadmin/index.html",
    "/cgi-bin/test",
    "/vendor/phpunit/src/Util/PHP/eval-stdin.php",
  ])("should block scanner probe %s", (path) => {
    expect(isBlockedPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/api/health",
    "/api/expenses",
    "/admin",
    "/logs",
    "/logs.js",
    "/assets/index-abc123.js",
    "/environment",
    "/settings/env-config",
    "/.well-known/security.txt",
    "/robots.txt",
    "/backend/%%bad",
  ])("should allow %s", (path) => {
    expect(isBlockedPath(path)).toBe(false);
  });

  it.each([undefined, null, ""])("should not block an empty path (%s)", (path) => {
    expect(isBlockedPath(path)).toBe(false);
  });

  it("should use a custom pattern list when provided", () => {
    expect(isBlockedPath("/secret-probe", [/^\/secret-/])).toBe(true);
    expect(isBlockedPath("/.env", [/^\/secret-/])).toBe(false);
  });
});

describe("createBlockedPathGuard", () => {
  function makeRes() {
    const res = { status: vi.fn(), type: vi.fn(), send: vi.fn() };
    res.status.mockReturnValue(res);
    res.type.mockReturnValue(res);
    return res;
  }

  it("should respond 404 and log at info level with request details for a blocked path", () => {
    const logger = { info: vi.fn() };
    const res = makeRes();
    const next = vi.fn();
    const req = { method: "GET", path: "/.env", ip: "10.0.0.1", get: (name) => ({ "fly-client-ip": "203.0.113.7", "user-agent": "scanner/1.0" })[name] };

    createBlockedPathGuard({ logger })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith("Not found.");
    expect(next).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("blocked_path", {
      event: "blocked_path",
      method: "GET",
      path: "/.env",
      clientIp: "203.0.113.7",
      userAgent: "scanner/1.0",
    });
  });

  it("should pass through allowed paths without logging", () => {
    const logger = { info: vi.fn() };
    const res = makeRes();
    const next = vi.fn();

    createBlockedPathGuard({ logger })({ method: "GET", path: "/api/config", get: () => undefined }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
