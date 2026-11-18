import { useMemo, type JSX } from "react";
import { FormattedAmount } from "./FormattedAmount";
import { LoadingBlock } from "./LoadingBlock";
import { YearSpendChart } from "./YearSpendChart";
import { CategoryBreakdownPanel } from "./CategoryBreakdownPanel";
import { getYearMonthlyAmounts, getYearlyAverageSpend, getYearRange, computePriorYearRange } from "../utils/yearDetails";
import { IsoNormalizer } from "../utils/dashboardStats";
import { ExpenseRecord } from "../types/expense";
import type { CategoryBreakdownRow } from "../utils/monthDetails";

export interface YearDetailsPanelProps {
  records: ExpenseRecord[];
  toIso: IsoNormalizer;
  year: number;
  today: string;
  /** True while the consumer is (re)loading records — renders a spinner instead of stats. */
  isLoading?: boolean;
  /** Drill-down into a clicked/tapped month bar — forwarded from YearSpendChart. */
  onMonthClick?: (year: number, month: number) => void;
}

interface CategoryTrendProps {
  row: CategoryBreakdownRow;
  toIso: IsoNormalizer;
  year: number;
  today: string;
  currentMonthIndex: number | null;
}

function CategoryTrend({ row, toIso, year, today, currentMonthIndex }: CategoryTrendProps): JSX.Element {
  // A row's records are already limited to the displayed year and merged when Group is on.
  const monthlyAmounts = useMemo(() => getYearMonthlyAmounts(row.records, year, toIso, today), [row.records, year, toIso, today]);
  return (
    <div className="month-details-trend">
      <p className="month-details-trend-label">{row.label} · {year} · by month</p>
      <YearSpendChart
        monthlyAmounts={monthlyAmounts}
        year={year}
        currentMonthIndex={currentMonthIndex}
        ariaLabel={`${row.label} spending by month`}
      />
    </div>
  );
}

export function YearDetailsPanel({ records, toIso, year, today, isLoading, onMonthClick }: YearDetailsPanelProps): JSX.Element {
  const monthlyAmounts = useMemo(() => getYearMonthlyAmounts(records, year, toIso, today), [records, year, toIso, today]);
  const averagePerMonth = useMemo(() => getYearlyAverageSpend(records, year, toIso, today), [records, year, toIso, today]);
  const { startDate, endDate } = useMemo(() => getYearRange(year, today), [year, today]);
  const { startDate: priorStartDate, endDate: priorEndDate } = useMemo(
    () => computePriorYearRange(startDate, endDate),
    [startDate, endDate],
  );
  const currentMonthIndex = year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) - 1 : null;

  if (isLoading) {
    return (
      <div className="year-details">
        <LoadingBlock label="Loading…" />
      </div>
    );
  }

  return (
    <div className="year-details">
      <p className="year-details-average">
        Average spent per month:{" "}
        {averagePerMonth === null ? "No data" : <FormattedAmount prefix="$" value={averagePerMonth} />}
      </p>
      {averagePerMonth !== null && (
        <>
          <YearSpendChart
            monthlyAmounts={monthlyAmounts}
            year={year}
            averagePerMonth={averagePerMonth}
            currentMonthIndex={currentMonthIndex}
            onMonthClick={onMonthClick}
          />
          <CategoryBreakdownPanel
            records={records}
            toIso={toIso}
            startDate={startDate}
            endDate={endDate}
            priorStartDate={priorStartDate}
            priorEndDate={priorEndDate}
            currentLabel={String(year)}
            priorLabel={String(year - 1)}
            defaultGrouped
            expandHint="Expand to see per-month trend"
            renderRowDetails={(row) => (
              <CategoryTrend row={row} toIso={toIso} year={year} today={today} currentMonthIndex={currentMonthIndex} />
            )}
          />
        </>
      )}
    </div>
  );
}
