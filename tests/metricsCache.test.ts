import { describe, it, expect, beforeEach, vi } from "vitest";
import { metricsCache, type MetricsCacheEntry } from "../src/services/metricsCache";

const TODAY = "2026-06-24";

vi.mock("../src/utils/date", () => ({
  getTodayLocalDate: () => TODAY,
}));

function makeEntry(overrides: Partial<MetricsCacheEntry> = {}): MetricsCacheEntry {
  return {
    cacheDate: TODAY,
    sheetLastModifiedTime: "2026-06-24T10:00:00.000Z",
    todayStats: { count: 1, usdTotal: 50, dualCurrency: null },
    mtdStats: { count: 5, usdTotal: 200, deviation: null },
    ytdStats: { count: 20, usdTotal: 800, deviation: null },
    rolling12mStats: { count: 100, usdTotal: 4000, deviation: null },
    mtdDailyAmounts: [10, 20, 30],
    weekBoundaryPositions: [6, 13],
    ...overrides,
  };
}

const EMAIL = "user@example.com";

beforeEach(() => {
  localStorage.clear();
});

describe("metricsCache.save / load", () => {
  it("returns null when no entry exists", () => {
    expect(metricsCache.load(EMAIL)).toBeNull();
  });

  it("reads back a saved entry", () => {
    const entry = makeEntry();
    metricsCache.save(EMAIL, entry);
    expect(metricsCache.load(EMAIL)).toEqual(entry);
  });

  it("is case-insensitive on email", () => {
    metricsCache.save("User@Example.COM", makeEntry());
    expect(metricsCache.load("user@example.com")).not.toBeNull();
  });

  it("returns null when cacheDate is not today (midnight rollover)", () => {
    metricsCache.save(EMAIL, makeEntry({ cacheDate: "2026-06-23" }));
    expect(metricsCache.load(EMAIL)).toBeNull();
  });

  it("returns null for a different email", () => {
    metricsCache.save("other@example.com", makeEntry());
    expect(metricsCache.load(EMAIL)).toBeNull();
  });
});

describe("metricsCache.clear", () => {
  it("removes the entry so load returns null", () => {
    metricsCache.save(EMAIL, makeEntry());
    metricsCache.clear(EMAIL);
    expect(metricsCache.load(EMAIL)).toBeNull();
  });

  it("is a no-op when no entry exists", () => {
    expect(() => metricsCache.clear(EMAIL)).not.toThrow();
  });
});
