import { buildExpenseHeaders, MAX_DATASET_BYTES, POST_CURRENCY_HEADERS, RESERVED_COLUMN_NAMES, SHEET_NAME } from "../constants/expenses";
import { DistinctValues, ExpenseDraft, ExpenseRecord, HeaderDetails, HeaderRowDetail } from "../types/expense";

export function deriveHeaderRowDetails(details: HeaderDetails): HeaderRowDetail[] {
  const rows: HeaderRowDetail[] = [];
  const maxLen = Math.max(details.expected.length, details.actual.length);
  for (let i = 0; i < maxLen; i++) {
    const expected = details.expected[i] ?? "";
    const actual = details.actual[i] ?? "";
    let status: HeaderRowDetail["status"];
    if (i >= details.expected.length) {
      status = "extra";
    } else if (i >= details.actual.length) {
      status = "missing";
    } else if (expected === actual) {
      status = "match";
    } else {
      status = "mismatch";
    }
    rows.push({ index: i, expected: expected || "(none)", actual: actual || "(missing)", status });
  }
  return rows;
}

const distinctFixedKeys = ["Category", "spentBy"] as const;

export function validateColumnName(
  name: string,
  existingNames: string[],
  excludeName?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Column name cannot be empty.";
  if (trimmed.length > 30) return "Column name must be 30 characters or less.";
  const lower = trimmed.toLowerCase();
  if ((RESERVED_COLUMN_NAMES as readonly string[]).some((r) => r.toLowerCase() === lower)) {
    return `"${trimmed}" is a reserved column name.`;
  }
  const duplicate = existingNames.some(
    (n) => n.toLowerCase() === lower && n.toLowerCase() !== excludeName?.toLowerCase(),
  );
  if (duplicate) return `A column named "${trimmed}" already exists.`;
  return null;
}

export function parseSpreadsheetUrl(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

export function normalizeHeaderRow(row: string[] | undefined): string[] {
  return (row ?? []).map((value) => value.trim());
}

export function isHeaderRowEmpty(row: string[] | undefined): boolean {
  return !row || row.every((value) => value.trim() === "");
}

export function createEmptyExpenseDraft(defaultEmail = "", currencies: string[] = [], customColumns: string[] = []): ExpenseDraft {
  const currencyAmounts: Record<string, string> = {};
  for (const code of currencies) {
    currencyAmounts[code] = "";
  }
  const customFields: Record<string, string> = {};
  for (const col of customColumns) {
    customFields[col] = "";
  }

  return {
    Date: new Date().toISOString().slice(0, 10),
    USD: "",
    Category: "",
    spentBy: defaultEmail,
    Comment: "",
    currencyAmounts,
    customFields,
  };
}

export function mapRowsToExpenseRecords(rows: string[][], sheetCurrencies: string[], customColumns: string[] = []): ExpenseRecord[] {
  const headers = buildExpenseHeaders(sheetCurrencies, customColumns);

  return rows.map((row, index) => {
    const padded = [...row];
    while (padded.length < headers.length) {
      padded.push("");
    }

    const currencyAmounts: Record<string, string> = {};
    for (let i = 0; i < sheetCurrencies.length; i++) {
      currencyAmounts[sheetCurrencies[i]] = padded[1 + i] ?? "";
    }

    const postStart = 1 + sheetCurrencies.length;
    const customFields: Record<string, string> = {};
    for (let i = 0; i < customColumns.length; i++) {
      customFields[customColumns[i]] = padded[postStart + 4 + i] ?? "";
    }

    return {
      Date: padded[0] ?? "",
      currencyAmounts,
      USD: padded[postStart] ?? "",
      Category: padded[postStart + 1] ?? "",
      spentBy: padded[postStart + 2] ?? "",
      Comment: padded[postStart + 3] ?? "",
      customFields,
      rowNumber: index + 2,
    };
  });
}

export function expenseDraftToRowValues(draft: ExpenseDraft, sheetCurrencies: string[], customColumns: string[] = []): string[] {
  const currencyValues = sheetCurrencies.map((code) => draft.currencyAmounts[code] ?? "");
  const customValues = customColumns.map((name) => draft.customFields[name] ?? "");
  return [
    draft.Date,
    ...currencyValues,
    draft.USD,
    draft.Category,
    draft.spentBy,
    draft.Comment,
    ...customValues,
  ];
}

export function buildDistinctValues(records: ExpenseRecord[], customColumns: string[] = []): DistinctValues {
  const fixedSets: Record<string, Set<string>> = { Category: new Set(), spentBy: new Set() };
  const customSets: Record<string, Set<string>> = {};
  for (const col of customColumns) {
    customSets[col] = new Set();
  }

  for (const record of records) {
    for (const key of distinctFixedKeys) {
      const value = record[key].trim();
      if (value) fixedSets[key].add(value);
    }
    for (const col of customColumns) {
      const value = record.customFields[col]?.trim();
      if (value) customSets[col].add(value);
    }
  }

  const customFields: Record<string, string[]> = {};
  for (const col of customColumns) {
    customFields[col] = [...(customSets[col] ?? new Set())].sort((a, b) => a.localeCompare(b));
  }

  return {
    Category: [...fixedSets.Category].sort((a, b) => a.localeCompare(b)),
    spentBy: [...fixedSets.spentBy].sort((a, b) => a.localeCompare(b)),
    customFields,
  };
}

export function calculateJsonByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function assertDatasetWithinLimit(records: ExpenseRecord[]): number {
  const payloadBytes = calculateJsonByteSize(records);
  if (payloadBytes > MAX_DATASET_BYTES) {
    throw new Error(
      `Dataset size ${payloadBytes} exceeds the allowed limit of ${MAX_DATASET_BYTES} bytes.`,
    );
  }

  return payloadBytes;
}

/**
 * Merge predefined categories (from Config sheet) with dataset-derived categories.
 * The result is deduplicated and sorted alphabetically.
 */
export function mergeCategories(fromDataset: string[], predefined: string[]): string[] {
  if (!predefined.length) return fromDataset;
  return [...new Set([...fromDataset, ...predefined])].sort((a, b) => a.localeCompare(b));
}

export { SHEET_NAME };
