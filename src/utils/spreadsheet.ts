import { EXPENSE_HEADERS, MAX_DATASET_BYTES, SHEET_NAME } from "../constants/expenses";
import { DistinctValues, ExpenseDraft, ExpenseRecord } from "../types/expense";

const distinctKeys: (keyof DistinctValues)[] = [
  "Category",
  "WhoSpent",
  "ForWhom",
  "PaymentChannel",
  "Theme",
];

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

export function validateHeaderRow(row: string[] | undefined): boolean {
  const normalized = normalizeHeaderRow(row);
  return (
    normalized.length === EXPENSE_HEADERS.length &&
    EXPENSE_HEADERS.every((header, index) => normalized[index] === header)
  );
}

export function createEmptyExpenseDraft(defaultEmail = ""): ExpenseDraft {
  return {
    Date: new Date().toISOString().slice(0, 10),
    PLN: "",
    BYN: "",
    EUR: "",
    USD: "",
    Category: "",
    WhoSpent: defaultEmail,
    ForWhom: "",
    Comment: "",
    PaymentChannel: "",
    Theme: "",
  };
}

export function mapRowsToExpenseRecords(rows: string[][]): ExpenseRecord[] {
  return rows.map((row, index) => {
    const padded = [...row];
    while (padded.length < EXPENSE_HEADERS.length) {
      padded.push("");
    }

    const record: ExpenseDraft = {
      Date: padded[0] ?? "",
      PLN: padded[1] ?? "",
      BYN: padded[2] ?? "",
      EUR: padded[3] ?? "",
      USD: padded[4] ?? "",
      Category: padded[5] ?? "",
      WhoSpent: padded[6] ?? "",
      ForWhom: padded[7] ?? "",
      Comment: padded[8] ?? "",
      PaymentChannel: padded[9] ?? "",
      Theme: padded[10] ?? "",
    };

    return {
      ...record,
      rowNumber: index + 2,
    };
  });
}

export function expenseDraftToRowValues(draft: ExpenseDraft): string[] {
  return EXPENSE_HEADERS.map((header) => draft[header]);
}

export function buildDistinctValues(records: ExpenseRecord[]): DistinctValues {
  const result = {
    Category: new Set<string>(),
    WhoSpent: new Set<string>(),
    ForWhom: new Set<string>(),
    PaymentChannel: new Set<string>(),
    Theme: new Set<string>(),
  };

  for (const record of records) {
    for (const key of distinctKeys) {
      const value = record[key].trim();
      if (value) {
        result[key].add(value);
      }
    }
  }

  return {
    Category: [...result.Category].sort((a, b) => a.localeCompare(b)),
    WhoSpent: [...result.WhoSpent].sort((a, b) => a.localeCompare(b)),
    ForWhom: [...result.ForWhom].sort((a, b) => a.localeCompare(b)),
    PaymentChannel: [...result.PaymentChannel].sort((a, b) => a.localeCompare(b)),
    Theme: [...result.Theme].sort((a, b) => a.localeCompare(b)),
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

export { SHEET_NAME };
