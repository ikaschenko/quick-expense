import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, SearchX, RefreshCw } from "lucide-react";
import { ExpenseTable } from "../components/ExpenseTable";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { filterExpenses } from "../utils/search";
import { trackEvent } from "../services/analytics";

export function SearchPage(): JSX.Element {
  const { config } = useConfig();
  const dataset = useDataset();
  const navigate = useNavigate();
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!config) {
      navigate("/setup", { replace: true });
      return;
    }

    if (!dataset.snapshot && dataset.status !== "loading") {
      void dataset.loadDataset().catch(() => undefined);
    }
  }, [config, dataset, navigate]);

  const outcome = useMemo(() => {
    if (!dataset.snapshot) {
      return null;
    }

    return filterExpenses(dataset.snapshot.records, dataset.searchFilters);
  }, [dataset.searchFilters, dataset.snapshot]);

  return (
    <Layout title="Search">
      {/* Search bar */}
      <div className="search-hero-input">
        <SearchIcon size={18} className="search-icon" aria-hidden />
        <input
          className="input"
          value={dataset.searchFilters.comment}
          onChange={(event) => {
            dataset.setSearchFilters({
              ...dataset.searchFilters,
              comment: event.target.value,
            });
            if (!hasSearched && event.target.value.trim()) {
              setHasSearched(true);
              trackEvent("search_performed", { result_count: outcome?.allMatches.length ?? 0 });
            }
          }}
          placeholder="Search expenses…"
          inputMode="text"
          aria-label="Search expenses"
        />
      </div>

      {/* Category pills */}
      {dataset.snapshot ? (
        <>
          <div className="input-label mb-2">Categories</div>
          <div className="category-chips mb-4">
            <button
              type="button"
              className={`category-chip${dataset.searchFilters.categories.length === 0 ? " active" : ""}`}
              onClick={() => {
                dataset.setSearchFilters({ ...dataset.searchFilters, categories: [] });
                if (!hasSearched) setHasSearched(true);
              }}
            >
              All
            </button>
            {dataset.distinctValues.Category.map((category) => (
              <button
                key={category}
                type="button"
                className={`category-chip${dataset.searchFilters.categories.includes(category) ? " active" : ""}`}
                onClick={() => {
                  const cats = dataset.searchFilters.categories;
                  const next = cats.includes(category)
                    ? cats.filter((c) => c !== category)
                    : [...cats, category];
                  dataset.setSearchFilters({ ...dataset.searchFilters, categories: next });
                  if (!hasSearched) setHasSearched(true);
                }}
              >
                {category}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} className="mb-4">
            <button
              className="btn btn-secondary btn-inline"
              type="button"
              onClick={() => {
                dataset.setSearchFilters({ categories: [], comment: "" });
                setHasSearched(false);
              }}
            >
              Clear
            </button>
            <button
              className="btn btn-secondary btn-inline"
              type="button"
              onClick={() => {
                setHasSearched(true);
                trackEvent("search_performed", { result_count: outcome?.allMatches.length ?? 0 });
              }}
            >
              <SearchIcon size={14} aria-hidden />
              Search
            </button>
            <button
              className="btn btn-secondary btn-inline"
              type="button"
              onClick={() => void dataset.reloadDataset().catch(() => undefined)}
            >
              <RefreshCw size={14} aria-hidden className={dataset.status === "loading" ? "icon-spin" : ""} />
              Reload
            </button>
          </div>
        </>
      ) : null}

      {dataset.error ? <StatusBanner variant="error" message={dataset.error} /> : null}
      {dataset.status === "loading" ? <LoadingBlock label="Loading expenses…" variant="skeleton" /> : null}

      {dataset.snapshot && hasSearched && outcome ? (
        <>
          <div className="search-results-count">
            Results <span className="search-results-badge">{outcome.allMatches.length}</span>
          </div>

          {outcome.allMatches.length === 0 ? (
            <div className="expense-empty">
              <SearchX size={40} className="expense-empty-icon" />
              <p>No expenses match your search</p>
              <p className="text-sm muted mt-4">Try adjusting your filters or search term</p>
            </div>
          ) : (
            <>
              {outcome.truncated ? (
                <StatusBanner
                  variant="info"
                  message={`Showing first 100 of ${outcome.allMatches.length} results.`}
                />
              ) : null}
              <ExpenseTable records={outcome.visibleMatches} emptyMessage="Nothing found." />
            </>
          )}
        </>
      ) : null}
    </Layout>
  );
}
