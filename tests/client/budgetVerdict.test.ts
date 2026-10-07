import { describe, expect, it } from "vitest";
import { describeVerdict, verdictSeverity } from "../../app-web/utils/budgetVerdict";
import { BudgetVerdict } from "../../app-web/utils/budgetTimeline";

const identityDate = (iso: string) => iso;

describe("describeVerdict", () => {
  it.each([
    [{ kind: "actualOnly" }, "Add a budget or end date to see a projection."],
    [{ kind: "notEnoughData" }, "Not enough data to project."],
    [{ kind: "finished", totalUsd: 100, budgetUsd: 150 }, "Finished at $100.00 ($50.00 under budget)"],
    [{ kind: "finished", totalUsd: 150, budgetUsd: 100 }, "Finished at $150.00 (over budget by $50.00)"],
    [{ kind: "overBudget", overUsd: 25, sinceDate: "2026-07-01" }, "Over budget by $25.00 since 2026-07-01"],
  ] as [BudgetVerdict, string][]) ("describes settled verdict %j", (verdict, expected) => {
    expect(describeVerdict(verdict, identityDate)).toBe(expected);
  });

  it("should describe end-date projections as a range and collapse equal rounded amounts", () => {
    const verdict: BudgetVerdict = {
      kind: "projection", budgetUsd: null, endDate: "2026-07-20", horizonDate: "2028-07-09",
      paces: [
        { pace: "overall", rateUsd: 10, projectedAtEndUsd: 120, runOutDate: null },
        { pace: "recent", rateUsd: 11, projectedAtEndUsd: 180, runOutDate: null },
      ],
    };
    expect(describeVerdict(verdict, identityDate)).toBe("Projected $120.00–$180.00 by 2026-07-20");
    verdict.paces[1].projectedAtEndUsd = 120.004;
    expect(describeVerdict(verdict, identityDate)).toBe("Projected $120.00 by 2026-07-20");
  });

  it.each([
    [700, [600, 650], "On track: projected $600.00–$650.00 by 2026-07-20 ($50.00–$100.00 under budget)"],
    [700, [600, 600], "On track: projected $600.00 by 2026-07-20 ($100.00 under budget)"],
  ])("should describe an on-track budget with projected values %j", (budgetUsd, values, expected) => {
    const verdict: BudgetVerdict = {
      kind: "projection", budgetUsd, endDate: "2026-07-20", horizonDate: "2028-07-09",
      paces: values.map((projectedAtEndUsd, index) => ({ pace: index === 0 ? "overall" : "recent", rateUsd: 10, projectedAtEndUsd, runOutDate: null })),
    };
    expect(describeVerdict(verdict, identityDate)).toBe(expected);
  });

  it("should describe two run-out dates and mixed paces", () => {
    const verdict: BudgetVerdict = {
      kind: "projection", budgetUsd: 500, endDate: "2026-07-20", horizonDate: "2028-07-09",
      paces: [
        { pace: "overall", rateUsd: 30, projectedAtEndUsd: 600, runOutDate: "2026-07-15" },
        { pace: "recent", rateUsd: 40, projectedAtEndUsd: 700, runOutDate: "2026-07-13" },
      ],
    };
    expect(describeVerdict(verdict, identityDate)).toBe("Budget runs out between 2026-07-13 and 2026-07-15, 5–7 days before end");
    verdict.paces[1].projectedAtEndUsd = 400;
    verdict.paces[1].runOutDate = null;
    expect(describeVerdict(verdict, identityDate)).toBe("Projected $400.00–$600.00 by 2026-07-20; budget may run out ~2026-07-15, 5 days before end");
  });

  it("should describe budget-only run-out, horizon, and paused spending", () => {
    const verdict: BudgetVerdict = {
      kind: "projection", budgetUsd: 500, endDate: null, horizonDate: "2028-07-09",
      paces: [
        { pace: "overall", rateUsd: 30, projectedAtEndUsd: null, runOutDate: "2026-07-15" },
        { pace: "recent", rateUsd: 0, projectedAtEndUsd: null, runOutDate: null },
      ],
    };
    expect(describeVerdict(verdict, identityDate)).toBe("Budget runs out ~2026-07-15, or lasts longer if spending stays paused");
    verdict.paces[1].rateUsd = 20;
    verdict.paces[1].runOutDate = "2026-07-20";
    expect(describeVerdict(verdict, identityDate)).toBe("Budget runs out between 2026-07-15 and 2026-07-20");
    verdict.paces[0].runOutDate = "2030-01-01";
    verdict.paces[1].runOutDate = "2031-01-01";
    expect(describeVerdict(verdict, identityDate)).toBe("Budget lasts beyond 2028-07-09");
  });

  it("should mention a run-out on the end date", () => {
    const verdict: BudgetVerdict = {
      kind: "projection", budgetUsd: 100, endDate: "2026-07-20", horizonDate: "2028-07-09",
      paces: [
        { pace: "overall", rateUsd: 10, projectedAtEndUsd: 110, runOutDate: "2026-07-20" },
        { pace: "recent", rateUsd: 10, projectedAtEndUsd: 110, runOutDate: "2026-07-20" },
      ],
    };
    expect(describeVerdict(verdict, identityDate)).toBe("Budget runs out ~2026-07-20, on the end date");
  });
});

describe("verdictSeverity", () => {
  it.each([
    [{ kind: "actualOnly" }, "normal"],
    [{ kind: "overBudget", overUsd: 10, sinceDate: "2026-07-01" }, "alert"],
    [{ kind: "finished", totalUsd: 110, budgetUsd: 100 }, "alert"],
    [{ kind: "finished", totalUsd: 90, budgetUsd: 100 }, "normal"],
  ] as [BudgetVerdict, "normal" | "warning" | "alert"][]) ("should classify settled verdict %j", (verdict, expected) => {
    expect(verdictSeverity(verdict)).toBe(expected);
  });

  it("should classify one or both paces exceeding the end-date budget", () => {
    const verdict: BudgetVerdict = {
      kind: "projection", budgetUsd: 100, endDate: "2026-07-20", horizonDate: "2028-07-09",
      paces: [
        { pace: "overall", rateUsd: 10, projectedAtEndUsd: 110, runOutDate: "2026-07-20" },
        { pace: "recent", rateUsd: 5, projectedAtEndUsd: 90, runOutDate: null },
      ],
    };
    expect(verdictSeverity(verdict)).toBe("warning");
    verdict.paces[1].projectedAtEndUsd = 120;
    expect(verdictSeverity(verdict)).toBe("alert");
    verdict.endDate = null;
    expect(verdictSeverity(verdict)).toBe("normal");
  });
});