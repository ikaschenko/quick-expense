import { describe, it, expect, afterEach, vi } from "vitest";
import { currencyService } from "../../app-web/services/currency";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("currencyService.fetchLiveRates", () => {
  it("returns rates and the resolved date on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ rates: { PLN: 4.03 }, date: "2026-09-18" })),
    );

    await expect(currencyService.fetchLiveRates(["PLN"], "2026-09-19")).resolves.toEqual({
      rates: { PLN: 4.03 },
      date: "2026-09-18",
    });
  });

  it("returns empty rates and null date without calling the API when no currencies are requested", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(currencyService.fetchLiveRates([])).resolves.toEqual({ rates: {}, date: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty rates and null date when the API responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Exchange rate service is temporarily unavailable." }, false, 503)),
    );

    await expect(currencyService.fetchLiveRates(["PLN"], "2026-09-19")).resolves.toEqual({
      rates: {},
      date: null,
    });
  });

  it("returns empty rates and null date on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(currencyService.fetchLiveRates(["PLN"], "2026-09-19")).resolves.toEqual({
      rates: {},
      date: null,
    });
  });
});
