import { MAX_SEARCH_RESULTS } from "../constants/expenses";
import { ExpenseRecord, SearchFilters } from "../types/expense";

export interface SearchOutcome {
  allMatches: ExpenseRecord[];
  visibleMatches: ExpenseRecord[];
  truncated: boolean;
}

export function filterExpenses(records: ExpenseRecord[], filters: SearchFilters): SearchOutcome {
  const normalizedComment = filters.comment.trim().toLowerCase();
  const selectedCategories = new Set(filters.categories);

  const parts = normalizedComment.split("*").filter((p) => p.length > 0);
  const meaningfulChars = parts.join("").replace(/\s/g, "");

  const matches = records.filter((record) => {
    const categoryMatch =
      selectedCategories.size === 0 || selectedCategories.has(record.Category);
    const commentMatch =
      meaningfulChars.length < 2 ||
      parts.every((p) => record.Comment.toLowerCase().includes(p));

    return categoryMatch && commentMatch;
  });

  return {
    allMatches: matches,
    visibleMatches: matches.slice(0, MAX_SEARCH_RESULTS),
    truncated: matches.length > MAX_SEARCH_RESULTS,
  };
}
