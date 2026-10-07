import { BudgetVerdict, PaceProjection } from "./budgetTimeline";

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formattedRange(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const first = formatUsd(sorted[0]);
  const last = formatUsd(sorted[sorted.length - 1]);
  return first === last ? first : `${first}–${last}`;
}

function dateRange(dates: string[], formatDate: (iso: string) => string): string {
  const sorted = [...dates].sort();
  return sorted[0] === sorted[sorted.length - 1]
    ? `~${formatDate(sorted[0])}`
    : `between ${formatDate(sorted[0])} and ${formatDate(sorted[sorted.length - 1])}`;
}

function formatDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function describeProjection(verdict: Extract<BudgetVerdict, { kind: "projection" }>, formatDate: (iso: string) => string): string {
  const { budgetUsd, endDate, horizonDate, paces } = verdict;
  if (endDate !== null) {
    const projected = paces.map((pace) => pace.projectedAtEndUsd ?? 0);
    if (budgetUsd === null) return `Projected ${formattedRange(projected)} by ${formatDate(endDate)}`;

    const under = projected.map((value) => budgetUsd - value);
    const overPaces = paces.filter((pace) => (pace.projectedAtEndUsd ?? 0) > budgetUsd);
    if (overPaces.length === 0) {
      return `On track: projected ${formattedRange(projected)} by ${formatDate(endDate)} (${formattedRange(under)} under budget)`;
    }

    if (overPaces.length === paces.length) {
      const days = paces.map((pace) => pace.runOutDate ? Math.max(0, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${pace.runOutDate}T00:00:00Z`)) / 86_400_000)) : 0);
      const dayText = days.every((value) => value === 0)
        ? "on the end date"
        : `${Math.min(...days)}–${Math.max(...days)} days before end`;
      return `Budget runs out ${dateRange(paces.map((pace) => pace.runOutDate ?? endDate), formatDate)}, ${dayText}`;
    }

    const overPace = overPaces[0];
    const days = overPace.runOutDate
      ? Math.max(0, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${overPace.runOutDate}T00:00:00Z`)) / 86_400_000))
      : 0;
    const beforeEnd = days === 0 ? "on the end date" : `${formatDays(days)} before end`;
    return `Projected ${formattedRange(projected)} by ${formatDate(endDate)}; budget may run out ${overPace.runOutDate ? `~${formatDate(overPace.runOutDate)}` : "before then"}, ${beforeEnd}`;
  }

  const runOutPaces = paces.filter((pace) => pace.runOutDate !== null && pace.runOutDate <= horizonDate);
  if (runOutPaces.length === paces.length && runOutPaces.length > 0) {
    return `Budget runs out ${dateRange(runOutPaces.map((pace) => pace.runOutDate!), formatDate)}`;
  }
  if (runOutPaces.length > 0) {
    const runOut = runOutPaces[0].runOutDate!;
    const pausedPace = paces.some((pace) => pace.pace === "recent" && pace.rateUsd <= 0);
    return pausedPace
      ? `Budget runs out ~${formatDate(runOut)}, or lasts longer if spending stays paused`
      : `Budget runs out ~${formatDate(runOut)}, or lasts beyond ${formatDate(horizonDate)}`;
  }
  return `Budget lasts beyond ${formatDate(horizonDate)}`;
}

export function describeVerdict(verdict: BudgetVerdict, formatDate: (iso: string) => string): string {
  switch (verdict.kind) {
    case "actualOnly":
      return "Add a budget or end date to see a projection.";
    case "notEnoughData":
      return "Not enough data to project.";
    case "finished": {
      const finished = `Finished at ${formatUsd(verdict.totalUsd)}`;
      if (verdict.budgetUsd === null) return finished;
      return verdict.totalUsd <= verdict.budgetUsd
        ? `${finished} (${formatUsd(verdict.budgetUsd - verdict.totalUsd)} under budget)`
        : `${finished} (over budget by ${formatUsd(verdict.totalUsd - verdict.budgetUsd)})`;
    }
    case "overBudget":
      return `Over budget by ${formatUsd(verdict.overUsd)} since ${formatDate(verdict.sinceDate)}`;
    case "projection":
      return describeProjection(verdict, formatDate);
  }
}

export function verdictSeverity(verdict: BudgetVerdict): "normal" | "warning" | "alert" {
  if (verdict.kind === "overBudget") return "alert";
  if (verdict.kind === "finished") return verdict.budgetUsd !== null && verdict.totalUsd > verdict.budgetUsd ? "alert" : "normal";
  if (verdict.kind !== "projection" || verdict.budgetUsd === null || verdict.endDate === null) return "normal";
  const overCount = verdict.paces.filter((pace: PaceProjection) => (pace.projectedAtEndUsd ?? 0) > verdict.budgetUsd!).length;
  return overCount === verdict.paces.length && overCount > 0 ? "alert" : overCount === 1 ? "warning" : "normal";
}