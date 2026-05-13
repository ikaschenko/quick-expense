import { useMemo, useState } from "react";
import {
  ShoppingCart,
  Bus,
  Utensils,
  Home,
  Heart,
  Briefcase,
  Zap,
  Receipt,
  Fuel,
  Shirt,
  GraduationCap,
  Plane,
  Gift,
  Dumbbell,
  Pill,
} from "lucide-react";
import { CustomColumn, ExpenseRecord } from "../types/expense";

import { LucideProps } from "lucide-react";

interface ExpenseTableProps {
  records: ExpenseRecord[];
  emptyMessage?: string;
  /** All currency columns in the sheet (active + archived). */
  sheetCurrencies?: string[];
  /** User's currently active currencies. */
  activeCurrencies?: string[];
  /** User's active custom column definitions. */
  customColumns?: CustomColumn[];
}

const COMMENT_PREVIEW_LENGTH = 72;

type LucideIcon = React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  food: Utensils,
  restaurant: Utensils,
  dining: Utensils,
  transport: Bus,
  taxi: Bus,
  uber: Bus,
  home: Home,
  rent: Home,
  utilities: Zap,
  health: Heart,
  medical: Pill,
  pharmacy: Pill,
  work: Briefcase,
  fuel: Fuel,
  gas: Fuel,
  clothing: Shirt,
  clothes: Shirt,
  education: GraduationCap,
  travel: Plane,
  gift: Gift,
  gifts: Gift,
  sport: Dumbbell,
  gym: Dumbbell,
  fitness: Dumbbell,
};

function getCategoryIcon(category: string): LucideIcon {
  const lower = category.toLowerCase();
  for (const [key, Icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return Receipt;
}

function getDisplayAmount(record: ExpenseRecord, sheetCurrencies: string[] = []): string {
  // Show the first non-empty non-USD currency amount
  for (const code of sheetCurrencies) {
    const val = record.currencyAmounts?.[code];
    if (val?.trim()) return `${code} ${val}`;
  }
  if (record.USD?.trim()) return `USD ${record.USD}`;
  return "—";
}

function formatGroupDate(dateStr: string): string {
  const normalized = dateStr.trim();
  return normalized || "Unknown";
}

function getCommentPreview(record: ExpenseRecord): string {
  const base = record.Comment;
  if (!base) return "";
  return base.length > COMMENT_PREVIEW_LENGTH
    ? `${base.slice(0, COMMENT_PREVIEW_LENGTH)}...`
    : base;
}

function hasDetails(record: ExpenseRecord, customColumns: CustomColumn[] = []): boolean {
  return (
    record.Comment.length > COMMENT_PREVIEW_LENGTH ||
    customColumns.some((col) => Boolean(record.customFields?.[col.name]?.trim()))
  );
}

function ExpenseDetails({ record, customColumns = [] }: { record: ExpenseRecord; customColumns?: CustomColumn[] }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const preview = getCommentPreview(record);

  if (!preview) return <></>;

  if (!hasDetails(record, customColumns)) {
    return <span className="expense-card-comment">{preview}</span>;
  }

  return (
    <div
      className="expense-card-details"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="expense-card-comment-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        onBlur={() => setIsOpen(false)}
        aria-expanded={isOpen}
        aria-label="Show full expense details"
      >
        {preview}
      </button>
      {isOpen ? (
        <div className="expense-card-tooltip" role="tooltip">
          {record.Comment.trim() ? (
            <div className="expense-card-tooltip-row">
              <span className="expense-card-tooltip-label">Comment:</span>
              <span>{record.Comment}</span>
            </div>
          ) : null}
          {customColumns.map((col) => {
            const val = record.customFields?.[col.name]?.trim();
            if (!val) return null;
            return (
              <div key={col.id} className="expense-card-tooltip-row">
                <span className="expense-card-tooltip-label">{col.name}:</span>
                <span>{val}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface DateGroup {
  date: string;
  records: ExpenseRecord[];
}

function groupByDate(records: ExpenseRecord[]): DateGroup[] {
  const groups = new Map<string, ExpenseRecord[]>();

  // Iterate in reverse so newest dates appear first
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    const date = record.Date || "Unknown";
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(record);
  }

  return Array.from(groups.entries()).map(([date, recs]) => ({ date, records: recs }));
}

export function ExpenseTable({
  records,
  emptyMessage = "No records found.",
  sheetCurrencies = [],
  activeCurrencies = [],
  customColumns = [],
}: ExpenseTableProps): JSX.Element {
  const groups = useMemo(() => groupByDate(records), [records]);

  if (records.length === 0) {
    return (
      <div className="expense-empty">
        <Receipt size={40} className="expense-empty-icon" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.date} className="expense-date-group">
          <div className="expense-date-header">{formatGroupDate(group.date)}</div>
          {group.records.map((record) => {
            const Icon = getCategoryIcon(record.Category);
            return (
              <div key={record.rowNumber} className="expense-card">
                <div className="expense-card-icon">
                  <Icon size={18} />
                </div>
                <div className="expense-card-body">
                  <div className="expense-card-top">
                    <span className="expense-card-category">
                      {record.Category}
                      {record.SpentBy ? (
                        <span className="expense-card-who">{record.SpentBy}</span>
                      ) : null}
                    </span>
                    <span className="expense-card-amount">{getDisplayAmount(record, sheetCurrencies)}</span>
                  </div>
                  {record.Comment || customColumns.some((col) => record.customFields?.[col.name]?.trim()) ? (
                    <div className="expense-card-bottom">
                      <ExpenseDetails record={record} customColumns={customColumns} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
