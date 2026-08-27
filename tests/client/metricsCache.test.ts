import { describe, it, expect, beforeEach } from "vitest";
import { metricsCache, type MetricsCacheEntry } from "../../app-web/services/metricsCache";

const TODAY = "2026-06-24";

function makeEntry(overrides: Partial<MetricsCacheEntry> = {}): MetricsCacheEntry {
  return {
    schemaVersion: 8,
    cacheDate: TODAY,
    spreadsheetId: "sheet-abc123",
    sheetLastModifiedTime: "2026-06-24T10:00:00.000Z",
    todayStats: { count: 1, usdTotal: 50, dualCurrency: null },
    mtdStats: { count: 5, usdTotal: 200, deviation: null },
    ytdStats: { count: 20, usdTotal: 800, deviation: null },
    ytdForecast: { amountUsd: 1500, deviation: null },
    rolling12mStats: { count: 100, usdTotal: 4000, deviation: null },
    mtdDailyAmounts: [10, 20, 30],
    weekBoundaryPositions: [6, 13],
    ...overrides,
  };
}

const EMAIL = "user@example.com";
const CACHE_KEY = `qe_metrics_${EMAIL}`;

beforeEach(() => {
  localStorage.clear();
});

describe("metricsCache.save / load", () => {
  const SPREADSHEET_ID = "sheet-abc123";

  it("returns null when no entry exists", () => {
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });

  it("reads back a saved entry", () => {
    const entry = makeEntry();
    metricsCache.save(EMAIL, entry);
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toEqual(entry);
  });

  it("round-trips null future-day sentinels in mtdDailyAmounts through JSON storage", () => {
    const entry = makeEntry({ mtdDailyAmounts: [10, 20, null, null] });
    metricsCache.save(EMAIL, entry);
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)?.mtdDailyAmounts).toEqual([10, 20, null, null]);
  });

  it("is case-insensitive on email", () => {
    metricsCache.save("User@Example.COM", makeEntry());
    expect(metricsCache.load("user@example.com", SPREADSHEET_ID)).not.toBeNull();
  });

  it("keeps an entry from an earlier day so callers can render it while refreshing", () => {
    const entry = makeEntry({ cacheDate: "2026-06-23" });
    metricsCache.save(EMAIL, entry);
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toEqual(entry);
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
  });

  it("returns null when schemaVersion is missing or outdated", () => {
    // Simulate stale entry written by old app code (before schema version bump)
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...makeEntry(), schemaVersion: 1 }));
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });

  it("returns null for a schemaVersion 7 entry written under the delete-at-midnight contract", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...makeEntry(), schemaVersion: 7 }));
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });

  it("returns null and evicts when the cached spreadsheetId does not match the currently linked sheet", () => {
    metricsCache.save(EMAIL, makeEntry({ spreadsheetId: "old-sheet" }));
    expect(metricsCache.load(EMAIL, "new-sheet")).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("returns null for a pre-forecast cache entry (schemaVersion 4, no ytdForecast field)", () => {
    // Simulate an entry written before the schema 4→5 bump that added ytdForecast.
    const { ytdForecast, ...legacyEntry } = makeEntry();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...legacyEntry, schemaVersion: 4 }));
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });

  it("returns null for a pre-forecast-deviation cache entry (schemaVersion 5, ytdForecast without deviation)", () => {
    // Simulate an entry written before the schema 5→6 bump that added ytdForecast.deviation.
    const legacyEntry = { ...makeEntry(), ytdForecast: { amountUsd: 1500 }, schemaVersion: 5 };
    localStorage.setItem(CACHE_KEY, JSON.stringify(legacyEntry));
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });

  it("evicts cache when payload contains non-finite numbers", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...makeEntry(), mtdStats: { count: 5, usdTotal: Infinity, deviation: null } }));

    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("evicts cache when payload contains oversized arrays", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...makeEntry(), mtdDailyAmounts: new Array(40).fill(1) }));

    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("drops injected strings by nulling invalid nested deviation payloads", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ...makeEntry(),
      ytdStats: {
        count: 20,
        usdTotal: 800,
        deviation: {
          up: true,
          pctChange: 12.3,
          absChange: 100,
          priorLabel: "<script>alert(1)</script>",
          priorTotal: 700,
        },
      },
    }));

    const entry = metricsCache.load(EMAIL, SPREADSHEET_ID);
    expect(entry).not.toBeNull();
    expect(entry?.ytdStats.deviation).toBeNull();
  });

  it("removes unknown fields on save", () => {
    const tainted = {
      ...makeEntry(),
      injected: "x",
    } as MetricsCacheEntry & { injected: string };

    metricsCache.save(EMAIL, tainted);

    const raw = localStorage.getItem(CACHE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("injected");
  });

  it("rejects save payloads with unexpected object prototype", () => {
    const withBadProto = Object.assign(Object.create({ polluted: true }), makeEntry()) as MetricsCacheEntry;

    metricsCache.save(EMAIL, withBadProto);

    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });

  it("returns null for a different email", () => {
    metricsCache.save("other@example.com", makeEntry());
    expect(metricsCache.load(EMAIL, SPREADSHEET_ID)).toBeNull();
  });
});

describe("metricsCache.clear", () => {
  it("removes the entry so load returns null", () => {
    metricsCache.save(EMAIL, makeEntry());
    metricsCache.clear(EMAIL);
    expect(metricsCache.load(EMAIL, "sheet-abc123")).toBeNull();
  });

  it("is a no-op when no entry exists", () => {
    expect(() => metricsCache.clear(EMAIL)).not.toThrow();
  });
});
