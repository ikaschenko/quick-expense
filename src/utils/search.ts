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

  const matches = records.filter((record) => {
    const categoryMatch =
      selectedCategoriesLower.size === 0 || selectedCategoriesLower.has(record.Category.trim().toLowerCase());
    const commentMatch =
      meaningfulChars.length < 2 ||
      parts.every((p) => record.Comment.toLowerCase().includes(p));

    return categoryMatch && commentMatch;
  });

  return {
    allMatches: matches,
    visibleMatches: matches.slice(-MAX_SEARCH_RESULTS),
    truncated: matches.length > MAX_SEARCH_RESULTS,
  };
}
