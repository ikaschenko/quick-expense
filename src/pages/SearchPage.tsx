import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
    <Layout>
      <section className="card">
        <div className="page-header">
          <div className="page-header-top">
            <h1>Search</h1>
            <button className="secondary-button" onClick={() => navigate(-1)} type="button">
              Back
            </button>
          </div>
        </div>
        {dataset.snapshot ? (
          <form
            className="form-layout"
            onSubmit={(event) => {
              event.preventDefault();
              setHasSearched(true);
              trackEvent("search_performed", { result_count: outcome?.allMatches.length ?? 0 });
            }}
          >
            <div className="button-row search-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  dataset.setSearchFilters({ categories: [], comment: "" });
                  setHasSearched(false);
                }}
                type="button"
              >
                Clear
              </button>
              <button className="primary-button" type="submit">
                Search
              </button>
              <button
                className="primary-button"
                onClick={() => void dataset.reloadDataset().catch(() => undefined)}
                type="button"
              >
                Reload
              </button>
            </div>
            <div className="field-grid emphasized-field-labels">
              <label className="field">
                <span>Category</span>
                <select
                  multiple
                  value={dataset.searchFilters.categories}
                  onChange={(event) =>
                    dataset.setSearchFilters({
                      ...dataset.searchFilters,
                      categories: Array.from(event.target.selectedOptions).map(
                        (option) => option.value,
                      ),
                    })
                  }
                  className="multi-select"
                >
                  {dataset.distinctValues.Category.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Comment contains</span>
                <input
                  value={dataset.searchFilters.comment}
                  onChange={(event) =>
                    dataset.setSearchFilters({
                      ...dataset.searchFilters,
                      comment: event.target.value,
                    })
                  }
                  placeholder="Type a substring"
                />
              </label>
            </div>
          </form>
        ) : null}

        {dataset.error ? <StatusBanner variant="error" message={dataset.error} /> : null}
        {dataset.status === "loading" ? <LoadingBlock label="Loading expenses…" /> : null}
        {dataset.snapshot ? (
          <>

            {hasSearched && outcome ? (
              <>
                {outcome.allMatches.length === 0 ? (
                  <StatusBanner variant="info" message="Nothing is found." />
                ) : null}
                {outcome.truncated ? (
                  <StatusBanner
                    variant="info"
                    message={`Too many records found. Showing first 100 of ${outcome.allMatches.length}.`}
                  />
                ) : null}
                <ExpenseTable records={outcome.visibleMatches} emptyMessage="Nothing is found." />
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </Layout>
  );
}
