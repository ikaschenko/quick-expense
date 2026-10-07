import { beforeEach, describe, expect, it } from "vitest";
import { buildBudgetTimeline, readBudgetSettings, writeBudgetSettings } from "../../app-web/utils/budgetTimeline";
import { ExpenseRecord } from "../../app-web/types/expense";

const TODAY = "2026-07-10";

function rec(date: string, usd: string): ExpenseRecord {
  return { Date: date, USD: usd, Category: "Trip", spentBy: "a", spentFor: "a", Comment: "", currencyAmounts: {}, customFields: {}, rowNumber: 1 };
}

// 300 spent over 10 elapsed days (Jul 1–10) → 30/day.
const TRIP = [rec("2026-07-01", "100"), rec("2026-07-05", "100"), rec("2026-07-10", "100")];

function build(overrides: Partial<Parameters<typeof buildBudgetTimeline>[0]> = {}) {
  return buildBudgetTimeline({ records: TRIP, todayIso: TODAY, dateFrom: "", budgetUsd: null, endDate: null, ...overrides });
}

describe("buildBudgetTimeline", () => {
  it("should return null when no record has a valid date", () => {
    expect(build({ records: [rec("", "10"), rec("not a date", "5")] })).toBeNull();
  });

  it("should return null for an empty record list", () => {
    expect(build({ records: [] })).toBeNull();
  });

  it("should plot daily actual totals without a projection when no budget or end date is set", () => {
    const timeline = build()!;

    expect(timeline.verdict).toEqual({ kind: "actualOnly" });
    expect(timeline.granularity).toBe("day");
    expect(timeline.points).toHaveLength(10);
    expect(timeline.points[0]).toEqual({ date: "2026-07-01", periodUsd: 100, actualCum: 100, projectedOverall: null, projectedRecent: null });
    expect(timeline.points[4].actualCum).toBe(200);
    expect(timeline.points.at(-1)?.actualCum).toBe(300);
    expect(timeline.points.every((p) => p.projectedOverall === null && p.projectedRecent === null)).toBe(true);
  });

  it("should extend actual data through today for open-ended filters", () => {
    const timeline = build({ records: [rec("2026-07-01", "10"), rec("2026-07-02", "10"), rec("2026-07-03", "10")] })!;

    expect(timeline.points.at(-1)).toEqual({ date: TODAY, periodUsd: 0, actualCum: 30, projectedOverall: null, projectedRecent: null });
  });

  it("should start at the From filter when it precedes the first match", () => {
    expect(build({ dateFrom: "2026-06-28" })!.startDate).toBe("2026-06-28");
  });

  it.each(["", "2026-13-01"]) ("should start at the earliest match when dateFrom is %j", (dateFrom) => {
    expect(build({ dateFrom })!.startDate).toBe("2026-07-01");
  });

  it("should use a valid From filter as the timeline start", () => {
    expect(build({ dateFrom: "2026-06-28" })!.startDate).toBe("2026-06-28");
  });

  it("should report not enough data with fewer than 3 distinct spend days", () => {
    const timeline = build({ records: TRIP.slice(0, 2), budgetUsd: 1000 })!;

    expect(timeline.verdict).toEqual({ kind: "notEnoughData" });
    expect(timeline.points.every((p) => p.projectedOverall === null && p.projectedRecent === null)).toBe(true);
  });

  it("should project overall and recent paces at the end date", () => {
    const timeline = build({ endDate: "2026-07-20" })!;

    expect(timeline.verdict).toMatchObject({
      kind: "projection",
      endDate: "2026-07-20",
      paces: [
        { pace: "overall", rateUsd: 30, projectedAtEndUsd: 600 },
        { pace: "recent", rateUsd: 200 / 7, projectedAtEndUsd: 300 + (200 / 7) * 10 },
      ],
    });
    expect(timeline.points.at(-1)).toEqual({
      date: "2026-07-20", periodUsd: null, actualCum: null,
      projectedOverall: 600, projectedRecent: 300 + (200 / 7) * 10,
    });
  });

  it("should start the projection from today's cumulative total", () => {
    const today = build({ endDate: "2026-07-20" })!.points.find((p) => p.date === TODAY);

    expect(today).toEqual({ date: TODAY, periodUsd: 100, actualCum: 300, projectedOverall: 300, projectedRecent: 300 });
  });

  it("should include exact run-out dates for both paces", () => {
    expect(build({ budgetUsd: 450 })!.verdict).toMatchObject({
      kind: "projection",
      paces: [
        { pace: "overall", runOutDate: "2026-07-15" },
        { pace: "recent", runOutDate: "2026-07-16" },
      ],
    });
  });

  it("should calculate a run-out date beyond the chart horizon", () => {
    const timeline = build({ budgetUsd: 1_000_000, endDate: "2030-01-01" })!;

    expect(timeline.verdict).toMatchObject({
      kind: "projection",
      paces: [
        { pace: "overall", runOutDate: "2117-10-05" },
        { pace: "recent", runOutDate: "2122-04-28" },
      ],
    });
    expect(timeline.points.at(-1)?.date).toBe("2028-07-09");
  });

  it("should omit the recent pace when the timeline covers fewer than 7 days", () => {
    const timeline = build({
      dateFrom: "2026-07-05",
      records: [rec("2026-07-05", "10"), rec("2026-07-08", "10"), rec(TODAY, "10")],
      endDate: "2026-07-20",
    })!;

    expect(timeline.verdict).toMatchObject({ kind: "projection", paces: [{ pace: "overall" }] });
  });

  it("should include the recent pace at exactly 7 days and count zero-spend days", () => {
    const timeline = build({
      dateFrom: "2026-07-04",
      records: [rec("2026-07-04", "10"), rec("2026-07-07", "10"), rec(TODAY, "10")],
      endDate: "2026-07-20",
    })!;

    expect(timeline.verdict).toMatchObject({
      kind: "projection",
      paces: [{ pace: "overall" }, { pace: "recent", rateUsd: 30 / 7 }],
    });
  });

  it("should keep a zero recent pace when no recent spending occurred", () => {
    const records = [rec("2026-07-01", "10"), rec("2026-07-02", "10"), rec("2026-07-03", "10")];

    expect(build({ records, budgetUsd: 100, endDate: "2026-07-20" })!.verdict).toMatchObject({
      kind: "projection",
      paces: [{ pace: "overall" }, { pace: "recent", rateUsd: 0 }],
    });
  });

  it("should report the run-out date and stop the chart there when only a budget is set", () => {
    const timeline = build({ budgetUsd: 450 })!;

    expect(timeline.verdict).toMatchObject({
      kind: "projection",
      paces: [{ pace: "overall", runOutDate: "2026-07-15" }, { pace: "recent", runOutDate: "2026-07-16" }],
    });
    expect(timeline.points.at(-1)).toMatchObject({ date: "2026-07-16", projectedOverall: 480, projectedRecent: 300 + (200 / 7) * 6 });
  });

  it("should report over budget since the first day the cap was exceeded", () => {
    expect(build({ budgetUsd: 150, endDate: "2026-07-20" })!.verdict).toEqual({
      kind: "overBudget", overUsd: 150, sinceDate: "2026-07-05",
    });
  });

  it("should not report over budget when spending equals the cap", () => {
    expect(build({ budgetUsd: 300 })!.verdict).toMatchObject({
      kind: "projection", paces: [{ runOutDate: TODAY }, { runOutDate: TODAY }],
    });
  });

  it("should not report over budget when a refund brings the total back under the cap", () => {
    const records = [...TRIP, rec("2026-07-12", "-200")];

    expect(build({ records, budgetUsd: 250 })!.verdict.kind).not.toBe("overBudget");
  });

  it("should summarise a finished period without a projection", () => {
    const timeline = build({ records: TRIP.slice(0, 2), endDate: "2026-07-08", budgetUsd: 250 })!;

    expect(timeline.verdict).toEqual({ kind: "finished", totalUsd: 200, budgetUsd: 250 });
    expect(timeline.points.at(-1)?.date).toBe("2026-07-08");
    expect(timeline.points.every((p) => p.projectedOverall === null && p.projectedRecent === null)).toBe(true);
  });

  it("should say the budget lasts beyond the projection limit for a far-away cap", () => {
    const timeline = build({ budgetUsd: 1_000_000 })!;

    expect(timeline.verdict).toMatchObject({ kind: "projection", horizonDate: "2028-07-09" });
    expect(timeline.points.at(-1)?.date).toBe("2028-07-09");
  });

  it("should say the budget lasts beyond the limit when the rate is zero or negative", () => {
    const records = [rec("2026-07-01", "100"), rec("2026-07-02", "100"), rec("2026-07-03", "-200")];

    expect(build({ records, budgetUsd: 500 })!.verdict).toMatchObject({
      kind: "projection", paces: [{ rateUsd: 0 }, { rateUsd: 0 }],
    });
  });

  it("should limit the chart to the projection horizon for a far end date", () => {
    const timeline = build({ endDate: "2030-01-01" })!;

    expect(timeline.verdict.kind).toBe("projection");
    expect(timeline.points.at(-1)?.date).toBe("2028-07-09");
  });

  it("should count future-dated expenses as actual and exclude them from the rate", () => {
    const records = [...TRIP, rec("2026-07-15", "100")];
    const timeline = build({ records, endDate: "2026-07-20" })!;

    expect(timeline.verdict).toMatchObject({
      kind: "projection",
      paces: [
        { pace: "overall", projectedAtEndUsd: 550 },
        { pace: "recent", projectedAtEndUsd: 400 + (200 / 7) * 5 },
      ],
    });
    expect(timeline.points.find((p) => p.date === "2026-07-15")).toMatchObject({ actualCum: 400, projectedOverall: 400 });
    expect(timeline.verdict.kind === "projection" && timeline.verdict.paces[1].rateUsd).toBe(200 / 7);
  });

  it("should ignore an end date before the start date and flag it", () => {
    const timeline = build({ endDate: "2026-06-01" })!;

    expect(timeline.endDateBeforeStart).toBe(true);
    expect(timeline.verdict).toEqual({ kind: "actualOnly" });
  });

  it.each([
    ["2026-04-12", "day", 90],
    ["2026-04-11", "week", 14],
  ] as const)("should use %s start → %s granularity", (dateFrom, granularity, length) => {
    const timeline = build({ dateFrom, records: [rec(TODAY, "10")] })!;

    expect(timeline.granularity).toBe(granularity);
    expect(timeline.points).toHaveLength(length);
  });

  it("should end weekly points on Sundays and close the last partial week on the axis end", () => {
    const records = [rec("2026-04-11", "5"), rec("2026-04-12", "5"), rec("2026-04-13", "7"), rec(TODAY, "3")];
    const timeline = build({ dateFrom: "2026-04-11", records })!;

    expect(timeline.points[0]).toEqual({ date: "2026-04-12", periodUsd: 10, actualCum: 10, projectedOverall: null, projectedRecent: null });
    expect(timeline.points[1]).toMatchObject({ date: "2026-04-19", periodUsd: 7, actualCum: 17 });
    expect(timeline.points.slice(0, -1).every((p) => new Date(`${p.date}T00:00:00Z`).getUTCDay() === 0)).toBe(true);
    expect(timeline.points.at(-1)).toMatchObject({ date: TODAY, actualCum: 20 });
  });

  it("should keep both weekly projection paces together at the current week point", () => {
    const timeline = build({
      dateFrom: "2026-04-11",
      records: [rec("2026-04-11", "5"), rec("2026-04-12", "5"), rec("2026-04-13", "7"), rec(TODAY, "3")],
      endDate: "2026-07-20",
    })!;
    const currentWeek = timeline.points.find((point) => point.date === "2026-07-12");

    expect(timeline.granularity).toBe("week");
    expect(currentWeek?.projectedOverall).toBe(20);
    expect(currentWeek?.projectedRecent).toBe(20);
  });

  it("should count the overall rate using UTC calendar days across a daylight-saving boundary", () => {
    const timeline = build({
      todayIso: "2026-03-10",
      dateFrom: "2026-03-02",
      records: [rec("2026-03-02", "10"), rec("2026-03-09", "10"), rec("2026-03-10", "10")],
      endDate: "2026-03-20",
    })!;

    expect(timeline.verdict).toMatchObject({ kind: "projection", paces: [{ rateUsd: 30 / 9 }, { rateUsd: 20 / 7 }] });
  });
});

describe("readBudgetSettings / writeBudgetSettings", () => {
  beforeEach(() => localStorage.clear());

  it("should return empty settings when nothing is stored", () => {
    expect(readBudgetSettings(localStorage, "a@b.com")).toEqual({ budgetUsd: null, endDate: null });
  });

  it("should round-trip settings per user regardless of email case", () => {
    writeBudgetSettings(localStorage, "User@Example.com", { budgetUsd: 3000, endDate: "2026-07-20" });

    expect(readBudgetSettings(localStorage, "user@example.com")).toEqual({ budgetUsd: 3000, endDate: "2026-07-20" });
    expect(readBudgetSettings(localStorage, "other@example.com")).toEqual({ budgetUsd: null, endDate: null });
  });

  it("should remove the entry when both values are empty", () => {
    writeBudgetSettings(localStorage, "a@b.com", { budgetUsd: 10, endDate: null });
    writeBudgetSettings(localStorage, "a@b.com", { budgetUsd: null, endDate: null });

    expect(localStorage.getItem("qe_budget_a@b.com")).toBeNull();
  });

  it.each([
    [{ budgetUsd: -5, endDate: "2026-02-30" }],
    [{ budgetUsd: "100", endDate: 20260720 }],
    [{ budgetUsd: 0 }],
    [null],
  ])("should drop invalid stored values %j", (stored) => {
    localStorage.setItem("qe_budget_a@b.com", JSON.stringify(stored));

    expect(readBudgetSettings(localStorage, "a@b.com")).toEqual({ budgetUsd: null, endDate: null });
    expect(localStorage.getItem("qe_budget_a@b.com")).toBeNull();
  });

  it("should preserve valid settings while removing an invalid individual value", () => {
    localStorage.setItem("qe_budget_a@b.com", JSON.stringify({ budgetUsd: -5, endDate: "2026-07-20" }));

    expect(readBudgetSettings(localStorage, "a@b.com")).toEqual({ budgetUsd: null, endDate: "2026-07-20" });
    expect(localStorage.getItem("qe_budget_a@b.com")).toBe(JSON.stringify({ budgetUsd: null, endDate: "2026-07-20" }));
  });

  it("should recover from corrupted JSON", () => {
    localStorage.setItem("qe_budget_a@b.com", "{oops");

    expect(readBudgetSettings(localStorage, "a@b.com")).toEqual({ budgetUsd: null, endDate: null });
    expect(localStorage.getItem("qe_budget_a@b.com")).toBeNull();
  });
});
