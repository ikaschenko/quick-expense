import { useMemo } from "react";
import { FormattedAmount } from "./FormattedAmount";
import { LoadingBlock } from "./LoadingBlock";
import { CategoryBreakdownPanel } from "./CategoryBreakdownPanel";
import { IsoNormalizer } from "../utils/dashboardStats";
import { getAverageDailySpend, computePriorMonthRange } from "../utils/monthDetails";
import { ExpenseRecord } from "../types/expense";

export interface MonthDetailsPanelProps {
  records: ExpenseRecord[];
  toIso: IsoNormalizer;
  /** Both dates must fall within the same calendar month. */
  startDate: string;
  endDate: string;
  /** True while the consumer is (re)loading records — renders a spinner instead of stats. */
  isLoading?: boolean;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${new Date(y, m - 1, 1).toLocaleString("en", { month: "short" })} ${y}`;
}

/**
 * Generic month-range breakdown panel — reused as-is by any future consumer that needs
 * average-per-day + category-vs-prior-month stats for an arbitrary same-month date range.
 */
export function MonthDetailsPanel({ records, toIso, startDate, endDate, isLoading }: MonthDetailsPanelProps): JSX.Element {
  const averagePerDay = useMemo(
    () => getAverageDailySpend(records, startDate, endDate, toIso),
    [records, startDate, endDate, toIso],
  );
  const { startDate: priorStartDate, endDate: priorEndDate } = useMemo(
    () => computePriorMonthRange(startDate, endDate),
    [startDate, endDate],
  );

  if (isLoading) {
    return (
      <div className="month-details">
        <LoadingBlock label="Loading…" />
      </div>
    );
  }

  return (
    <div className="month-details">
      <p className="month-details-average">
        Average spent per day: <FormattedAmount prefix="$" value={averagePerDay} />
      </p>
      <CategoryBreakdownPanel
        records={records}
        toIso={toIso}
        startDate={startDate}
        endDate={endDate}
        priorStartDate={priorStartDate}
        priorEndDate={priorEndDate}
        currentLabel={monthLabel(startDate)}
        priorLabel={monthLabel(priorStartDate)}
      />
    </div>
  );
}
