import { ExpenseRecord } from "../types/expense";

export const COMMENT_PREVIEW_LENGTH = 72;

const CUSTOM_COLUMN_LABELS: Record<string, string> = {
  SpentFor: "Spent For",
};

export function getCustomColumnLabel(name: string): string {
  return CUSTOM_COLUMN_LABELS[name] ?? name;
}

export function hasDetails(record: ExpenseRecord, customColumns: string[] = []): boolean {
  return (
    record.Comment.trim().length > 0 ||
    customColumns.some((col) => Boolean(record.customFields?.[col]?.trim()))
  );
}

function stripDecimals(amount: string): string {
  return amount.trim().replace(/^\$/, "").replace(/\.\d+$/, "");
}

export function getDisplayAmount(record: ExpenseRecord, sheetCurrencies: string[] = []): string {
  for (const code of sheetCurrencies) {
    const val = record.currencyAmounts?.[code];
    if (val?.trim()) {
      const local = `${code} ${stripDecimals(val)}`;
      return record.USD?.trim() ? `${local} / $${stripDecimals(record.USD)}` : local;
    }
  }
  if (record.USD?.trim()) return `$${stripDecimals(record.USD)}`;
  return "\u2014";
}

export function getDisplayAmountFull(record: ExpenseRecord, sheetCurrencies: string[] = []): string {
  const clean = (s: string) => s.trim().replace(/^\$/, "");
  for (const code of sheetCurrencies) {
    const val = record.currencyAmounts?.[code];
    if (val?.trim()) {
      const local = `${code} ${clean(val)}`;
      return record.USD?.trim() ? `${local} / $${clean(record.USD)}` : local;
    }
  }
  if (record.USD?.trim()) return `$${clean(record.USD)}`;
  return "\u2014";
}
