import { useMemo, useRef, useState } from "react";
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
import { ExpenseRecord } from "../types/expense";

import { LucideProps } from "lucide-react";

interface ExpenseTableProps {
  records: ExpenseRecord[];
  emptyMessage?: string;
  /** All currency columns in the sheet (active + archived). */
  sheetCurrencies?: string[];
  /** User's currently active currencies. */
  activeCurrencies?: string[];
  /** User's active custom column names. */
  customColumns?: string[];
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

const CUSTOM_COLUMN_LABELS: Record<string, string> = {
  SpentFor: "Spent For",
};

export function getCustomColumnLabel(name: string): string {
  return CUSTOM_COLUMN_LABELS[name] ?? name;
}

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

export function hasDetails(record: ExpenseRecord, customColumns: string[] = []): boolean {
  return (
    record.Comment.length > COMMENT_PREVIEW_LENGTH ||
    customColumns.some((col) => Boolean(record.customFields?.[col]?.trim()))
  );
}

interface ExpenseCardProps {
  record: ExpenseRecord;
  sheetCurrencies: string[];
  customColumns: string[];
}

function ExpenseCard({ record, sheetCurrencies, customColumns }: ExpenseCardProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const lastTouchRef = useRef(0);
  const Icon = getCategoryIcon(record.Category);
  const cardHasDetails = hasDetails(record, customColumns);
  const preview = getCommentPreview(record);
  const hasBottom = Boolean(preview) || customColumns.some((col) => record.customFields?.[col]?.trim());

  return (
    <div
      className={`expense-card${cardHasDetails ? " expense-card--interactive" : ""}`}
      onTouchStart={() => { lastTouchRef.current = Date.now(); }}
      onMouseEnter={() => { if (Date.now() - lastTouchRef.current > 500) setIsOpen(true); }}
      onMouseLeave={() => { if (Date.now() - lastTouchRef.current > 500) setIsOpen(false); }}
      onClick={() => { if (cardHasDetails) setIsOpen((prev) => !prev); }}
    >
      <div className="expense-card-icon">
        <Icon size={18} />
      </div>
      <div className="expense-card-body">
        <div className="expense-card-top">
          <span className="expense-card-category">
            {record.Category}
            {record.spentBy ? (
              <span className="expense-card-who">{record.spentBy}</span>
            ) : null}
          </span>
          <span className="expense-card-amount">{getDisplayAmount(record, sheetCurrencies)}</span>
        </div>
        {hasBottom ? (
          <div className="expense-card-bottom">
            <div className="expense-card-details">
              {preview ? <span className="expense-card-comment">{preview}</span> : null}
              {isOpen ? (
                <div className="expense-card-tooltip" role="tooltip">
                  {record.Comment.trim() ? (
                    <div className="expense-card-tooltip-row">
                      <span className="expense-card-tooltip-label">Comment:</span>
                      <span>{record.Comment}</span>
                    </div>
                  ) : null}
                  {customColumns.map((col) => {
                    const val = record.customFields?.[col]?.trim();
                    if (!val) return null;
                    return (
                      <div key={col} className="expense-card-tooltip-row">
                        <span className="expense-card-tooltip-label">{getCustomColumnLabel(col)}:</span>
                        <span>{val}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
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
          {group.records.map((record) => (
            <ExpenseCard
              key={record.rowNumber}
              record={record}
              sheetCurrencies={sheetCurrencies}
              customColumns={customColumns}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
