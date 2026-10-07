import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import DatePicker from "react-datepicker";
import { BudgetBurnUpChart } from "./BudgetBurnUpChart";
import { ExpenseRecord } from "../types/expense";
import { buildBudgetTimeline, readBudgetSettings, writeBudgetSettings } from "../utils/budgetTimeline";
import { describeVerdict, verdictSeverity } from "../utils/budgetVerdict";
import { formatDisplayDate, formatLocalDate, getTodayLocalDate, isValidIsoDate, readDateDisplayFormat } from "../utils/date";

const BUDGET_HELP_TEXT = "Range between your average daily spending since the start date and over the last 7 days.";

interface BudgetTrackerPanelProps {
  records: ExpenseRecord[];
  dateFrom: string;
  email: string;
}

export function BudgetTrackerPanel({ records, dateFrom, email }: BudgetTrackerPanelProps): JSX.Element {
  const [initialSettings] = useState(() => readBudgetSettings(localStorage, email));
  const [budgetText, setBudgetText] = useState(initialSettings.budgetUsd === null ? "" : String(initialSettings.budgetUsd));
  const [endDate, setEndDate] = useState<string | null>(initialSettings.endDate);
  const [helpOpen, setHelpOpen] = useState(false);
  const dateDisplayFormat = useMemo(() => readDateDisplayFormat(localStorage), []);
  const todayIso = getTodayLocalDate();

  const parsedBudget = budgetText.trim() === "" ? null : Number(budgetText);
  const budgetInvalid = parsedBudget !== null && !(Number.isFinite(parsedBudget) && parsedBudget > 0);
  const budgetUsd = budgetInvalid ? null : parsedBudget;

  useEffect(() => {
    writeBudgetSettings(localStorage, email, { budgetUsd, endDate });
  }, [email, budgetUsd, endDate]);

  const timeline = useMemo(
    () => buildBudgetTimeline({ records, todayIso, dateFrom, budgetUsd, endDate }),
    [records, todayIso, dateFrom, budgetUsd, endDate],
  );

  const formatDate = (iso: string): string => formatDisplayDate(iso, dateDisplayFormat);
  const verdictText = timeline ? describeVerdict(timeline.verdict, formatDate) : "No dated expenses to show.";
  const severity = timeline ? verdictSeverity(timeline.verdict) : "normal";
  const verdictClass = `budget-tracker-verdict${severity === "normal" ? "" : ` budget-tracker-verdict--${severity}`}`;

  return (
    <div className="budget-tracker">
      <div className="budget-tracker-header">
        <p className={verdictClass} role="status">{verdictText}</p>
        <button
          type="button"
          className="section-help-btn"
          aria-expanded={helpOpen}
          aria-label={`${helpOpen ? "Hide" : "Show"} info about budget projection`}
          onClick={() => setHelpOpen((open) => !open)}
        >
          <Info size={14} aria-hidden />
        </button>
      </div>
      {helpOpen && <p className="section-help-popover">{BUDGET_HELP_TEXT}</p>}
      <div className="budget-tracker-inputs">
        <label className="budget-tracker-field">
          <span className="input-label">Budget (USD)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="e.g. 3000"
            value={budgetText}
            onChange={(event) => setBudgetText(event.target.value)}
            aria-invalid={budgetInvalid}
          />
        </label>
        <div className="budget-tracker-field">
          <span className="input-label">Ends</span>
          <DatePicker
            className="input"
            selected={endDate && isValidIsoDate(endDate) ? new Date(`${endDate}T00:00:00`) : null}
            onChange={(date: Date | null) => setEndDate(date ? formatLocalDate(date) : null)}
            dateFormat="yyyy-MM-dd"
            placeholderText="YYYY-MM-DD"
            isClearable
            popperPlacement="bottom-start"
            showPopperArrow={false}
            aria-label="Budget end date"
          />
        </div>
      </div>
      {budgetInvalid && <p className="field-error">Enter a budget greater than 0.</p>}
      {timeline?.endDateBeforeStart && (
        <p className="field-error">End date must be on or after {formatDate(timeline.startDate)}.</p>
      )}
      {timeline && (
        <BudgetBurnUpChart
          points={timeline.points}
          granularity={timeline.granularity}
          todayIso={todayIso}
          endDate={timeline.endDateBeforeStart ? null : endDate}
          budgetUsd={budgetUsd}
        />
      )}
    </div>
  );
}
