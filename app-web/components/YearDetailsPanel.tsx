import { useMemo } from "react";
import { FormattedAmount } from "./FormattedAmount";
import { LoadingBlock } from "./LoadingBlock";
import { YearSpendChart } from "./YearSpendChart";
import { getYearMonthlyAmounts, getYearlyAverageSpend } from "../utils/yearDetails";
import { IsoNormalizer } from "../utils/dashboardStats";
import { ExpenseRecord } from "../types/expense";

export interface YearDetailsPanelProps {
  records: ExpenseRecord[];
  toIso: IsoNormalizer;
  year: number;
  today: string;
  /** True while the consumer is (re)loading records — renders a spinner instead of stats. */
  isLoading?: boolean;
}

export function YearDetailsPanel({ records, toIso, year, today, isLoading }: YearDetailsPanelProps): JSX.Element {
  const monthlyAmounts = useMemo(() => getYearMonthlyAmounts(records, year, toIso, today), [records, year, toIso, today]);
  const averagePerMonth = useMemo(() => getYearlyAverageSpend(records, year, toIso, today), [records, year, toIso, today]);

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
      {averagePerMonth !== null && <YearSpendChart monthlyAmounts={monthlyAmounts} />}
    </div>
  );
}
