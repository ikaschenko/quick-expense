import { useMemo, useRef, useEffect, useState } from "react";
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
  Trash2,
  Pencil,
  Check,
} from "lucide-react";
import { ExpenseRecord } from "../types/expense";
import { COMMENT_PREVIEW_LENGTH, getCustomColumnLabel, getDisplayAmount, hasDetails } from "../utils/expenseTable";

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
  /** Row number of the record that may be deleted (last record). */
  lastRecordRowNumber?: number;
  /** Called when the user requests deletion of a record. */
  onDeleteRequest?: (record: ExpenseRecord) => void;
  /** Called when the user requests editing of a record. */
  onEditRequest?: (record: ExpenseRecord) => void;
  /** Row number of a record to auto-open and scroll to (Back or Save from Edit). */
  highlightedRowNumber?: number | null;
  /** Row number of a record that was just successfully saved (shows badge). */
  savedRowNumber?: number | null;
}

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

function formatGroupDate(dateStr: string): string {
  const normalized = dateStr.trim();
  return normalized || "Unknown";
}

function getCommentPreview(record: ExpenseRecord): string {
  const base = record.Comment;
  if (!base) return "";
  const flat = base.replace(/\n/g, " ");
  return flat.length > COMMENT_PREVIEW_LENGTH
    ? `${flat.slice(0, COMMENT_PREVIEW_LENGTH)}...`
    : flat;
}


interface ExpenseCardProps {
  record: ExpenseRecord;
  sheetCurrencies: string[];
  customColumns: string[];
  isLastRecord?: boolean;
  onDeleteRequest?: (record: ExpenseRecord) => void;
  onEditRequest?: (record: ExpenseRecord) => void;
  isHighlighted?: boolean;
  isSaved?: boolean;
}

function ExpenseCard({ record, sheetCurrencies, customColumns, isLastRecord, onDeleteRequest, onEditRequest, isHighlighted, isSaved }: ExpenseCardProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(isHighlighted ?? false);
  const cardRef = useRef<HTMLDivElement>(null);
  const Icon = getCategoryIcon(record.Category);
  const cardHasDetails = hasDetails(record, customColumns) || (isLastRecord && !!onDeleteRequest) || !!onEditRequest;
  const preview = getCommentPreview(record);

  useEffect(() => {
    if (isHighlighted) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      className={`expense-card${cardHasDetails ? " expense-card--interactive" : ""}`}
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
        {!isOpen && preview ? (
          <div className="expense-card-bottom">
            <span className="expense-card-comment">{preview}</span>
          </div>
        ) : null}
        {isOpen ? (
          <div className="expense-card-expanded">
            {record.Comment.trim() ? (
              <div className="expense-card-expanded-row">
                <span className="expense-card-expanded-label">Comment:</span>
                <span className="expense-comment-text">{record.Comment}</span>
              </div>
            ) : null}
            {customColumns.map((col) => {
              const val = record.customFields?.[col]?.trim();
              if (!val) return null;
              return (
                <div key={col} className="expense-card-expanded-row">
                  <span className="expense-card-expanded-label">{getCustomColumnLabel(col)}:</span>
                  <span>{val}</span>
                </div>
              );
            })}
            {(onEditRequest || (isLastRecord && onDeleteRequest)) ? (
              <div className="expense-card-actions">
                {isSaved ? (
                  <span className="expense-saved-badge">
                    <Check size={11} aria-hidden />
                    Saved
                  </span>
                ) : null}
                {onEditRequest ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    aria-label="Edit this expense"
                    onClick={(e) => { e.stopPropagation(); onEditRequest(record); }}
                  >
                    <Pencil size={14} aria-hidden />
                    Edit
                  </button>
                ) : null}
                {isLastRecord && onDeleteRequest ? (
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    aria-label="Delete this expense"
                    onClick={(e) => { e.stopPropagation(); onDeleteRequest(record); }}
                  >
                    <Trash2 size={14} aria-hidden />
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
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
  lastRecordRowNumber,
  onDeleteRequest,
  onEditRequest,
  highlightedRowNumber,
  savedRowNumber,
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
              isLastRecord={record.rowNumber === lastRecordRowNumber}
              onDeleteRequest={onDeleteRequest}
              onEditRequest={onEditRequest}
              isHighlighted={record.rowNumber === highlightedRowNumber}
              isSaved={record.rowNumber === savedRowNumber}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
