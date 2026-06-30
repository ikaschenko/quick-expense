import { MAX_SEARCH_RESULTS } from "../constants/expenses";
import { ExpenseRecord, SearchFilters } from "../types/expense";

export interface SearchOutcome {
  allMatches: ExpenseRecord[];
  visibleMatches: ExpenseRecord[];
  truncated: boolean;
}

export function filterExpenses(records: ExpenseRecord[], filters: SearchFilters): SearchOutcome {
  const normalizedComment = filters.comment.trim().toLowerCase();
  const selectedCategoriesLower = new Set(filters.categories.map((c) => c.toLowerCase()));

  const parts = normalizedComment.split(/\s+/).filter((p) => p.length > 0);
  const meaningfulChars = parts.join("");

  const amountFromNum = filters.amountFrom !== "" ? parseFloat(filters.amountFrom) : null;
  const amountToNum = filters.amountTo !== "" ? parseFloat(filters.amountTo) : null;

  const customFieldEntries = Object.entries(filters.customFields).filter(([, v]) => v.trim() !== "");

  const matches = records.filter((record) => {
    const categoryMatch =
      selectedCategoriesLower.size === 0 || selectedCategoriesLower.has(record.Category.trim().toLowerCase());
    const commentMatch =
      meaningfulChars.length < 2 ||
      parts.every((p) => record.Comment.toLowerCase().includes(p));

    // Amount range filter
    if (amountFromNum !== null || amountToNum !== null) {
      const recordUSD = parseFloat(record.USD.replace(/[$,]/g, ""));
      if (isNaN(recordUSD)) return false;
      if (amountFromNum !== null && recordUSD < amountFromNum) return false;
      if (amountToNum !== null && recordUSD > amountToNum) return false;
    }

    // Custom field filters (same multi-word substring logic as comment)
    for (const [key, value] of customFieldEntries) {
      const fieldParts = value.trim().toLowerCase().split(/\s+/).filter((p) => p.length > 0);
      const fieldMeaningfulChars = fieldParts.join("");
      if (fieldMeaningfulChars.length >= 2) {
        const recordValue = (record.customFields[key] ?? "").toLowerCase();
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
