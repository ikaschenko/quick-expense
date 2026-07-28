import { ExpenseDraft, ExpenseRecord } from "../types/expense";

export const COMMENT_PREVIEW_LENGTH = 72;

export interface DateGroup {
  date: string;
  records: ExpenseRecord[];
}

export function groupByDate(records: ExpenseRecord[]): DateGroup[] {
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

/**
 * Returns records from `records` that match `draft` on date, category, and amount.
 * Matches on USD when available; falls back to non-USD currency amounts otherwise.
 */
export function findDuplicateExpenses(
  draft: ExpenseDraft,
  records: ExpenseRecord[],
  currencies: string[],
): ExpenseRecord[] {
  const draftDate = draft.Date.trim();
  const draftCategory = draft.Category.trim().toLowerCase();

  // Prefer non-USD currency amounts (user-entered) over USD (derived via FX).
  // Two expenses with the same local amount but different FX rates should still be flagged.
  const hasNonUsdAmount = currencies.some((code) => {
    const amt = Number.parseFloat((draft.currencyAmounts[code] ?? "").replace(",", "."));
    return !Number.isNaN(amt) && amt !== 0;
  });

  const draftUsd = Number.parseFloat(draft.USD.replace(",", ".").replace(/^\$/, ""));

  return records.filter((r) => {
    if (r.Date.trim() !== draftDate) return false;
    if (r.Category.trim().toLowerCase() !== draftCategory) return false;

    if (hasNonUsdAmount) {
      return currencies.some((code) => {
        const draftAmt = Number.parseFloat((draft.currencyAmounts[code] ?? "").replace(",", "."));
        const recAmt = Number.parseFloat(String(r.currencyAmounts[code] ?? "").replace(",", "."));
        return !Number.isNaN(draftAmt) && draftAmt !== 0 && !Number.isNaN(recAmt) && Math.abs(draftAmt - recAmt) <= 0.005;
      });
    }

    // No non-USD amount — fall back to USD
    if (!Number.isNaN(draftUsd) && draftUsd !== 0) {
      const recUsd = Number.parseFloat(String(r.USD ?? "").replace(",", ".").replace(/^\$/, ""));
      return !Number.isNaN(recUsd) && Math.abs(draftUsd - recUsd) <= 0.005;
    }

    return false;
  });
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
