import { buildExpenseHeaders, MAX_DATASET_BYTES, POST_CURRENCY_HEADERS, SHEET_NAME } from "../constants/expenses";
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

export function validateHeaderRow(row: string[] | undefined, sheetCurrencies: string[]): boolean {
  const normalized = normalizeHeaderRow(row);
  const expected = buildExpenseHeaders(sheetCurrencies);
  return (
    normalized.length === expected.length &&
    expected.every((header, index) => normalized[index] === header)
  );
}

export function createEmptyExpenseDraft(defaultEmail = "", currencies: string[] = []): ExpenseDraft {
  const currencyAmounts: Record<string, string> = {};
  for (const code of currencies) {
    currencyAmounts[code] = "";
  }

  return {
    Date: new Date().toISOString().slice(0, 10),
    USD: "",
    Category: "",
    WhoSpent: defaultEmail,
    ForWhom: "",
    Comment: "",
    PaymentChannel: "",
    Theme: "",
    currencyAmounts,
  };
}

export function mapRowsToExpenseRecords(rows: string[][], sheetCurrencies: string[]): ExpenseRecord[] {
  const headers = buildExpenseHeaders(sheetCurrencies);

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
    return {
      Date: padded[0] ?? "",
      currencyAmounts,
      USD: padded[postStart] ?? "",
      Category: padded[postStart + 1] ?? "",
      WhoSpent: padded[postStart + 2] ?? "",
      ForWhom: padded[postStart + 3] ?? "",
      Comment: padded[postStart + 4] ?? "",
      PaymentChannel: padded[postStart + 5] ?? "",
      Theme: padded[postStart + 6] ?? "",
      rowNumber: index + 2,
    };
  });
}

export function expenseDraftToRowValues(draft: ExpenseDraft, sheetCurrencies: string[]): string[] {
  const currencyValues = sheetCurrencies.map((code) => draft.currencyAmounts[code] ?? "");
  return [
    draft.Date,
    ...currencyValues,
    draft.USD,
    draft.Category,
    draft.WhoSpent,
    draft.ForWhom,
    draft.Comment,
    draft.PaymentChannel,
    draft.Theme,
  ];
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
