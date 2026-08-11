import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requestJson, requestNoContent } from "../../app-web/services/http";
import { AppError } from "../../app-web/types/expense";

const FETCH_TIMEOUT_MS = 15_000;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("requestJson", () => {
  it("resolves with the parsed JSON body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hello: "world" })));

    await expect(requestJson("/api/thing")).resolves.toEqual({ hello: "world" });
  });

  it("throws a network AppError with a timeout message when the request never settles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const pending = requestJson("/api/slow");
    const assertion = expect(pending).rejects.toMatchObject({ kind: "network", message: expect.stringContaining("timed out") });
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await assertion;
  });

  it("re-throws AppError produced from a non-ok response without altering it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Nope" }, false, 403)));

    await expect(requestJson("/api/thing")).rejects.toMatchObject(new AppError("authorization", "Nope"));
  });
});

describe("requestNoContent", () => {
  it("resolves with no value on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, true, 204)));

    await expect(requestNoContent("/api/thing")).resolves.toBeUndefined();
  });

  it("throws a network AppError with a timeout message when the request never settles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const pending = requestNoContent("/api/slow");
    const assertion = expect(pending).rejects.toMatchObject({ kind: "network", message: expect.stringContaining("timed out") });
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await assertion;
  });
});
