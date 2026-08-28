import { useMemo, useState } from "react";
import { FormattedAmount } from "./FormattedAmount";
import { LoadingBlock } from "./LoadingBlock";
import { formatPctChange, IsoNormalizer } from "../utils/dashboardStats";
import { getAverageDailySpend, getCategoryBreakdown, computePriorMonthRange, buildPieSlices } from "../utils/monthDetails";
import { ExpenseRecord } from "../types/expense";
import { CategoryPieChart } from "./CategoryPieChart";

export interface MonthDetailsPanelProps {
  records: ExpenseRecord[];
  toIso: IsoNormalizer;
  /** Both dates must fall within the same calendar month. */
  startDate: string;
  endDate: string;
  /** True while the consumer is (re)loading records — renders a spinner instead of stats. */
  isLoading?: boolean;
}

type TopFilter = "top5" | "all";

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${new Date(y, m - 1, 1).toLocaleString("en", { month: "short" })} ${y}`;
}

/**
 * Generic month-range breakdown panel — reused as-is by any future consumer that needs
 * average-per-day + category-vs-prior-month stats for an arbitrary same-month date range.
 */
export function MonthDetailsPanel({ records, toIso, startDate, endDate, isLoading }: MonthDetailsPanelProps): JSX.Element {
  const [topFilter, setTopFilter] = useState<TopFilter>("all");
  const [grouped, setGrouped] = useState(false);

  const averagePerDay = useMemo(
    () => getAverageDailySpend(records, startDate, endDate, toIso),
    [records, startDate, endDate, toIso],
  );
  const breakdown = useMemo(
    () => getCategoryBreakdown(records, startDate, endDate, toIso, { grouped }),
    [records, startDate, endDate, toIso, grouped],
  );
  const rows = topFilter === "top5" ? breakdown.slice(0, 5) : breakdown;
  const currentTotal = rows.reduce((sum, row) => sum + row.currentAmount, 0);
  const pieSlices = useMemo(() => buildPieSlices(rows, topFilter), [rows, topFilter]);

  const currentLabel = monthLabel(startDate);
  const priorLabel = monthLabel(computePriorMonthRange(startDate, endDate).startDate);

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
      <div className="month-details-controls">
        <h3 className="month-details-heading">Categories</h3>
        <div className="month-details-buttons">
          <div className="month-details-segmented" role="group" aria-label="Rows shown">
            <button
              type="button"
              className={`month-details-segment${topFilter === "top5" ? " active" : ""}`}
              aria-pressed={topFilter === "top5"}
              onClick={() => setTopFilter("top5")}
            >
              Top 5
            </button>
            <button
              type="button"
              className={`month-details-segment${topFilter === "all" ? " active" : ""}`}
              aria-pressed={topFilter === "all"}
              onClick={() => setTopFilter("all")}
            >
              All
            </button>
          </div>
          <button
            type="button"
            className={`month-details-group-toggle${grouped ? " active" : ""}`}
            aria-pressed={grouped}
            onClick={() => setGrouped((v) => !v)}
          >
            Group
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="month-details-empty">No expenses in this period.</p>
      ) : (
        <>
          <CategoryPieChart slices={pieSlices} />
          <table className="month-details-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>%</th>
                <th>{currentLabel}</th>
                <th>{priorLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>
                    <span className="month-details-percent">
                      {currentTotal !== 0 ? ((row.currentAmount / currentTotal) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </td>
                  <td>
                    <span className="month-details-amount">
                      <FormattedAmount prefix="$" value={row.currentAmount} />
                    </span>
                    {row.deviationPct !== null && (
                      <span
                        className={`month-details-deviation${
                          row.deviationPct > 0 ? " yoy-up" : row.deviationPct < 0 ? " yoy-down" : ""
                        }`}
                      >
                        {" "}({row.deviationPct >= 0 ? "+" : "-"}{formatPctChange(Math.abs(row.deviationPct))}%)
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="month-details-amount">
                      {row.priorAmount !== null ? <FormattedAmount prefix="$" value={row.priorAmount} /> : "-"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
