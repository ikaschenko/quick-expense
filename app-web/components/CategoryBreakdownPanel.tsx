import { Fragment, useEffect, useMemo, useState } from "react";
import { FormattedAmount } from "./FormattedAmount";
import { CategoryPieChart } from "./CategoryPieChart";
import { formatPctChange, IsoNormalizer } from "../utils/dashboardStats";
import { getCategoryBreakdown, buildPieSlices } from "../utils/monthDetails";
import { COMMENT_PREVIEW_LENGTH } from "../utils/expenseTable";
import { DateDisplayFormat, formatDisplayDate } from "../utils/date";
import { ExpenseRecord } from "../types/expense";

export interface CategoryBreakdownPanelProps {
  records: ExpenseRecord[];
  toIso: IsoNormalizer;
  startDate: string;
  endDate: string;
  priorStartDate: string;
  priorEndDate: string;
  /** Column header for the current-period amount (e.g. "Jan 2026" or "2026"). */
  currentLabel: string;
  /** Column header for the prior-period amount (e.g. "Dec 2025" or "2025"). */
  priorLabel: string;
  /** Initial state of the Group toggle (default off). */
  defaultGrouped?: boolean;
  /** Enables current-period transaction drill-down rows. */
  showInlineDetails?: boolean;
  /** Display format used by current-period transaction dates. */
  dateDisplayFormat?: DateDisplayFormat;
}

type TopFilter = "top5" | "all";

/**
 * Category table + pie chart for an arbitrary [startDate, endDate] range vs a caller-supplied
 * prior-period range — shared by MonthDetailsPanel (prior month) and YearDetailsPanel (prior year).
 */
export function CategoryBreakdownPanel({
  records,
  toIso,
  startDate,
  endDate,
  priorStartDate,
  priorEndDate,
  currentLabel,
  priorLabel,
  defaultGrouped = false,
  showInlineDetails = false,
  dateDisplayFormat = "locale",
}: CategoryBreakdownPanelProps): JSX.Element {
  const [topFilter, setTopFilter] = useState<TopFilter>("all");
  const [grouped, setGrouped] = useState(defaultGrouped);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const breakdown = useMemo(
    () => getCategoryBreakdown(records, startDate, endDate, priorStartDate, priorEndDate, toIso, { grouped }),
    [records, startDate, endDate, priorStartDate, priorEndDate, toIso, grouped],
  );
  const rows = topFilter === "top5" ? breakdown.slice(0, 5) : breakdown;
  const currentTotal = rows.reduce((sum, row) => sum + row.currentAmount, 0);
  const pieSlices = useMemo(() => buildPieSlices(rows, topFilter), [rows, topFilter]);

  useEffect(() => {
    setExpandedCategory(null);
  }, [startDate, endDate, grouped, topFilter]);

  const getCommentPreview = (comment: string): string => {
    const flat = comment.replaceAll("\n", " ");
    return flat.length > COMMENT_PREVIEW_LENGTH ? `${flat.slice(0, COMMENT_PREVIEW_LENGTH)}...` : flat;
  };

  const formatLocalDate = (rawDate: string): string => {
    const iso = toIso(rawDate);
    if (!iso) return rawDate;
    return formatDisplayDate(iso, dateDisplayFormat);
  };

  return (
    <>
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
              {rows.map((row) => {
                const isExpanded = expandedCategory === row.label;
                const detailsId = `month-details-${row.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
                return (
                  <Fragment key={row.label}>
                    {/* Row-level handler also catches clicks bubbling from the toggle button, so it fires exactly once. */}
                    <tr
                      className={showInlineDetails ? "month-details-category-row" : undefined}
                      onClick={
                        showInlineDetails
                          ? () => setExpandedCategory((current) => (current === row.label ? null : row.label))
                          : undefined
                      }
                    >
                      <td>
                        {showInlineDetails ? (
                          <button
                            type="button"
                            className="month-details-category-toggle"
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                          >
                            {row.label}
                          </button>
                        ) : row.label}
                      </td>
                      <td>
                        <span className="month-details-percent">
                          {currentTotal !== 0 ? ((row.currentAmount / currentTotal) * 100).toFixed(1) : "0.0"}%
                        </span>
                      </td>
                      <td>
                        <span className="month-details-current-value">
                          <span className="month-details-amount">
                            <FormattedAmount prefix="$" value={row.currentAmount} />
                          </span>
                          {row.deviationPct !== null && (
                            <span
                              className={`month-details-deviation${
                                row.deviationPct > 0 ? " yoy-up" : row.deviationPct < 0 ? " yoy-down" : ""
                              }`}
                            >
                              {"\u00a0"}({row.deviationPct >= 0 ? "+" : "-"}{formatPctChange(Math.abs(row.deviationPct))}%)
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="month-details-amount">
                          {row.priorAmount !== null ? <FormattedAmount prefix="$" value={row.priorAmount} /> : "-"}
                        </span>
                      </td>
                    </tr>
                    {showInlineDetails && isExpanded && (
                      <tr id={detailsId} className="month-details-transactions">
                        <td colSpan={4}>
                          <table aria-label={`${row.label} transactions`}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>For</th>
                                <th>Comment</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.records.map((record) => (
                                <tr key={record.rowNumber}>
                                  <td>{formatLocalDate(record.Date)}</td>
                                  <td><FormattedAmount prefix="$" value={Number.parseFloat(record.USD) || 0} /></td>
                                  <td title={record.spentFor}>{record.spentFor}</td>
                                  <td className="month-details-comment" title={record.Comment}>{getCommentPreview(record.Comment)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
