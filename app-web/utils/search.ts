import { MAX_SEARCH_RESULTS } from "../constants/expenses";
import { ExpenseRecord, SearchFilters } from "../types/expense";
import { isValidIsoDate, normalizeDateToIso } from "./date";

export interface SearchOutcome {
  allMatches: ExpenseRecord[];
  visibleMatches: ExpenseRecord[];
  truncated: boolean;
}

interface AmountCondition {
  op: "<" | ">" | "=";
  value: number;
}

/** Recognizes tokens like ">1000", "<19900", "=350.50"; anything else (incl. malformed operators) is not an amount condition. */
function parseAmountToken(token: string): AmountCondition | null {
  const match = /^([<>=])(-?\d+(?:\.\d+)?)$/.exec(token);
  if (!match) return null;
  return { op: match[1] as AmountCondition["op"], value: Number.parseFloat(match[2]) };
}

function parseRecordUsd(record: ExpenseRecord): number {
  return Number.parseFloat(record.USD.replace(/[$,]/g, ""));
}

/** All free-text fields eligible for the quick multi-field search. */
function searchableTextFields(record: ExpenseRecord): string[] {
  return [record.Category, record.spentBy, record.spentFor, record.Comment, ...Object.values(record.customFields)];
}

export function filterExpenses(records: ExpenseRecord[], filters: SearchFilters): SearchOutcome {
  const selectedCategoriesLower = new Set(filters.categories.map((c) => c.toLowerCase()));

  const rawTokens = filters.comment.trim().split(/\s+/).filter((p) => p.length > 0);
  const meaningfulChars = rawTokens.join("");

  const textTokens: string[] = [];
  const amountConditions: AmountCondition[] = [];
  if (meaningfulChars.length >= 2) {
    for (const token of rawTokens) {
      const condition = parseAmountToken(token);
      if (condition) {
        amountConditions.push(condition);
      } else {
        textTokens.push(token.toLowerCase());
      }
    }
  }

  const amountFromNum = filters.amountFrom !== "" ? Number.parseFloat(filters.amountFrom) : null;
  const amountToNum = filters.amountTo !== "" ? Number.parseFloat(filters.amountTo) : null;
  const dateFrom = filters.dateFrom === "" || isValidIsoDate(filters.dateFrom) ? filters.dateFrom : null;
  const dateTo = filters.dateTo === "" || isValidIsoDate(filters.dateTo) ? filters.dateTo : null;
  const hasDateFilter = filters.dateFrom !== "" || filters.dateTo !== "";
  const hasInvalidDateFilter = (filters.dateFrom !== "" && dateFrom === null) || (filters.dateTo !== "" && dateTo === null);

  const customFieldEntries = Object.entries(filters.customFields).filter(([, v]) => v.trim() !== "");

  const spentByParts = filters.spentBy.trim().toLowerCase().split(/\s+/).filter((p) => p.length > 0);
  const spentByMeaningfulChars = spentByParts.join("");
  const spentForParts = filters.spentFor.trim().toLowerCase().split(/\s+/).filter((p) => p.length > 0);
  const spentForMeaningfulChars = spentForParts.join("");

  const matches = records.filter((record) => {
    if (hasDateFilter) {
      if (hasInvalidDateFilter) return false;
      const recordDate = normalizeDateToIso(record.Date);
      if (!isValidIsoDate(recordDate)) return false;
      if (dateFrom !== "" && dateFrom !== null && recordDate < dateFrom) return false;
      if (dateTo !== "" && dateTo !== null && recordDate > dateTo) return false;
    }

    const categoryMatch =
      selectedCategoriesLower.size === 0 || selectedCategoriesLower.has(record.Category.trim().toLowerCase());

    const textMatch =
      textTokens.length === 0 ||
      textTokens.every((token) =>
        searchableTextFields(record).some((field) => field.toLowerCase().includes(token)),
      );
    let amountConditionsMatch = true;
    if (amountConditions.length > 0) {
      const recordUSD = parseRecordUsd(record);
      amountConditionsMatch =
        !Number.isNaN(recordUSD) &&
        amountConditions.every((condition) => {
          if (condition.op === ">") return recordUSD > condition.value;
          if (condition.op === "<") return recordUSD < condition.value;
          return Math.round(recordUSD * 100) === Math.round(condition.value * 100);
        });
    }
    const commentMatch = textMatch && amountConditionsMatch;

    if (filters.spentByExact) {
      if (record.spentBy.trim().toLowerCase() !== filters.spentBy.trim().toLowerCase()) return false;
    } else if (spentByMeaningfulChars.length >= 2) {
      const recordValue = record.spentBy.toLowerCase();
      if (!spentByParts.every((p) => recordValue.includes(p))) return false;
    }

    if (filters.spentForExact) {
      if (record.spentFor.trim().toLowerCase() !== filters.spentFor.trim().toLowerCase()) return false;
    } else if (spentForMeaningfulChars.length >= 2) {
      const recordValue = record.spentFor.toLowerCase();
      if (!spentForParts.every((p) => recordValue.includes(p))) return false;
    }

    // Amount range filter
    if (amountFromNum !== null || amountToNum !== null) {
      const recordUSD = parseRecordUsd(record);
      if (Number.isNaN(recordUSD)) return false;
      if (amountFromNum !== null && recordUSD < amountFromNum) return false;
      if (amountToNum !== null && recordUSD > amountToNum) return false;
    }

    // Custom field filters (same multi-word substring logic as comment, unless an exact value was picked)
    for (const [key, value] of customFieldEntries) {
      const recordValue = (record.customFields[key] ?? "").toLowerCase();
      if (filters.customFieldsExact[key]) {
        if (recordValue !== value.trim().toLowerCase()) return false;
        continue;
      }
      const fieldParts = value.trim().toLowerCase().split(/\s+/).filter((p) => p.length > 0);
      const fieldMeaningfulChars = fieldParts.join("");
      if (fieldMeaningfulChars.length >= 2) {
        if (!fieldParts.every((p) => recordValue.includes(p))) return false;
      }
    }

    return categoryMatch && commentMatch;
  });

  return {
    allMatches: matches,
    visibleMatches: matches.slice(-MAX_SEARCH_RESULTS),
    truncated: matches.length > MAX_SEARCH_RESULTS,
  };
}
