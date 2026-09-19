// @vitest-environment node
vi.mock("../../app-server/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import logger from "../../app-server/logger.js";
import { fetchFxDataForDate, resolveFxRates } from "../../app-server/fx-rates.js";

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("fetchFxDataForDate", () => {
  it("returns the parsed body from jsDelivr when it succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ date: "2026-09-18", usd: { pln: 4.03 } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFxDataForDate("2026-09-18")).resolves.toEqual({ date: "2026-09-18", usd: { pln: 4.03 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("@2026-09-18/v1/currencies/usd.json");
  });

  it("falls back to the Cloudflare host when jsDelivr fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(jsonResponse({ date: "2026-09-18", usd: { pln: 4.03 } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFxDataForDate("2026-09-18")).resolves.toEqual({ date: "2026-09-18", usd: { pln: 4.03 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("2026-09-18.currency-api.pages.dev");
  });

  it("returns null when both hosts fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFxDataForDate("2026-09-18")).resolves.toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(fetchFxDataForDate("2026-09-18")).resolves.toBeNull();
  });
});

describe("resolveFxRates", () => {
  it("returns rates for the requested date on first success, with no fallback logging", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ date: "2026-09-19", usd: { pln: 4.03, eur: 0.92 } })));

    await expect(resolveFxRates({ currencies: ["PLN", "EUR"], date: "2026-09-19" })).resolves.toEqual({
      rates: { PLN: 4.03, EUR: 0.92 },
      date: "2026-09-19",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("walks backward and resolves to the nearest prior published date when today's data isn't out yet", async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes("2026-09-19")) return Promise.resolve(jsonResponse({}, false, 404));
      return Promise.resolve(jsonResponse({ date: "2026-09-18", usd: { pln: 4.03 } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveFxRates({ currencies: ["PLN"], date: "2026-09-19" })).resolves.toEqual({
      rates: { PLN: 4.03 },
      date: "2026-09-18",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "fx_api_fallback_date_used",
      expect.objectContaining({ requestedDate: "2026-09-19", resolvedDate: "2026-09-18" }),
    );
  });

  it("returns null after exhausting the lookback window", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 404)));

    await expect(resolveFxRates({ currencies: ["PLN"], date: "2026-09-19", maxLookbackDays: 2 })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "fx_api_exhausted",
      expect.objectContaining({ requestedDate: "2026-09-19", attempts: 3 }),
    );
  });

  it("does not walk backward when no date is requested (defaults to latest)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveFxRates({ currencies: ["PLN"] })).resolves.toBeNull();
    // jsDelivr + Cloudflare fallback for "latest" only — no extra dates attempted.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("omits currency codes with no numeric rate in the response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ date: "2026-09-19", usd: { pln: 4.03 } })));

    await expect(resolveFxRates({ currencies: ["PLN", "BYN"], date: "2026-09-19" })).resolves.toEqual({
      rates: { PLN: 4.03 },
      date: "2026-09-19",
    });
  });
});
