import { ExpenseRecord } from "../types/expense";

const COMMENT_PREVIEW_LENGTH = 72;

const CUSTOM_COLUMN_LABELS: Record<string, string> = {
  SpentFor: "Spent For",
};

export function getCustomColumnLabel(name: string): string {
  return CUSTOM_COLUMN_LABELS[name] ?? name;
}

export function hasDetails(record: ExpenseRecord, customColumns: string[] = []): boolean {
  return (
    record.Comment.length > COMMENT_PREVIEW_LENGTH ||
    customColumns.some((col) => Boolean(record.customFields?.[col]?.trim()))
  );
}
