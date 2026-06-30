import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { RefreshCw, Search as SearchIcon, SearchX, X, ChevronDown, ChevronUp } from "lucide-react";
import { HISTORY_PAGE_SIZE, FILTER_DEBOUNCE_MS } from "../constants/expenses";
import { ExpenseTable } from "../components/ExpenseTable";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { filterExpenses } from "../utils/search";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { getDisplayAmountFull } from "../utils/expenseTable";
import { ExpenseRecord, SearchFilters } from "../types/expense";

const emptyFilters: SearchFilters = {
  comment: "",
  categories: [],
  amountFrom: "",
  amountTo: "",
  customFields: {},
};

function isAnyFilterActive(f: SearchFilters): boolean {
  return (
    f.comment !== "" ||
    f.categories.length > 0 ||
    f.amountFrom !== "" ||
    f.amountTo !== "" ||
    Object.values(f.customFields).some((v) => v !== "")
  );
}

function countPanelFilters(f: SearchFilters): number {
  let count = 0;
  if (f.categories.length > 0) count++;
  if (f.amountFrom !== "") count++;
  if (f.amountTo !== "") count++;
  count += Object.values(f.customFields).filter((v) => v !== "").length;
  return count;
}

export function HistoryPage(): JSX.Element {
  const { config, isConfigLoading, error: configError } = useConfig();
  const dataset = useDataset();
  const { session } = useAuth();
  const isViewOnly = session?.guestAccessLevel === "view";
  const navigate = useNavigate();
  const location = useLocation();

  const [highlightedRowNumber] = useState<number | null>(
    (location.state as { editResult?: { rowNumber: number; saved: boolean } } | null)?.editResult?.rowNumber ?? null,
  );
  const [savedRowNumber, setSavedRowNumber] = useState<number | null>(
    (location.state as { editResult?: { rowNumber: number; saved: boolean } } | null)?.editResult?.saved
      ? ((location.state as { editResult: { rowNumber: number } }).editResult.rowNumber)
      : null,
  );

  const [pageSize, setPageSize] = useState(HISTORY_PAGE_SIZE);
  const [filterOpen, setFilterOpen] = useState(() => {
    const fil = dataset.searchFilters;
    return (
      fil.categories.length > 0 ||
      fil.amountFrom !== "" ||
      fil.amountTo !== "" ||
      Object.values(fil.customFields).some((v) => v !== "")
    );
  });
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(dataset.searchFilters);
  const [confirmRecord, setConfirmRecord] = useState<ExpenseRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Clear saved highlight after 4 seconds
  useEffect(() => {
    if (savedRowNumber === null) return;
    const timer = setTimeout(() => setSavedRowNumber(null), 4000);
    return () => clearTimeout(timer);
  }, [savedRowNumber]);

  // Load dataset when config is ready
  useEffect(() => {
    if (!config && !isConfigLoading && !configError) {
      navigate("/setup", { replace: true });
      return;
    }
    if (config && !dataset.snapshot && dataset.status !== "loading") {
      void dataset.loadDataset().catch(() => undefined);
    }
  }, [config, configError, isConfigLoading, dataset.snapshot, dataset.status, dataset.loadDataset, navigate]);

  // Debounce applied filters behind live filter state
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedFilters(dataset.searchFilters);
      if (isAnyFilterActive(dataset.searchFilters)) {
        trackEvent("search_performed", { result_count: undefined });
      }
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dataset.searchFilters]);

  // Reset page size whenever applied filters change
  useEffect(() => {
    setPageSize(HISTORY_PAGE_SIZE);
  }, [appliedFilters]);

  const isFiltered = isAnyFilterActive(appliedFilters);

  const visibleRecords = useMemo(
    () => dataset.snapshot?.records.slice(-pageSize) ?? [],
    [dataset.snapshot?.records, pageSize],
  );

  const datasetIsComplete = dataset.snapshot?.loadPhase === "full";

  const outcome = useMemo(
    () =>
      isFiltered && dataset.snapshot && datasetIsComplete
        ? filterExpenses(dataset.snapshot.records, appliedFilters)
        : null,
    [isFiltered, dataset.snapshot, datasetIsComplete, appliedFilters],
  );

  const lastRecord = dataset.snapshot?.records.at(-1) ?? null;
  const totalRecords = dataset.snapshot?.records.length ?? 0;

  const canShowEarlier = !isFiltered && (pageSize < totalRecords || dataset.isLoadingHistory);
  const showEarlierLoading = !isFiltered && pageSize >= totalRecords && dataset.isLoadingHistory;

  const panelFilterCount = countPanelFilters(dataset.searchFilters);

  const handleEditRequest = useCallback(
    (record: ExpenseRecord) => {
      navigate(`/edit/${record.rowNumber}`, { state: { record, origin: "/history" } });
    },
    [navigate],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmRecord || !dataset.snapshot) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await googleSheetsService.deleteLastExpenseRow(dataset.snapshot.records.length);
      setConfirmRecord(null);
      dataset.removeLastFromDataset();
    } catch (error) {
      setDeleteError((error as Error).message);
    } finally {
      setIsDeleting(false);
    }
  }, [confirmRecord, dataset]);

  const handleDeleteCancel = useCallback(() => {
    setConfirmRecord(null);
    setDeleteError(null);
  }, []);

  const handleClear = useCallback(() => {
    dataset.setSearchFilters(emptyFilters);
    setAppliedFilters(emptyFilters); // bypass debounce
  }, [dataset]);

  const handleCategoryToggle = useCallback(
    (category: string) => {
      const cats = dataset.searchFilters.categories;
      const next = cats.includes(category)
        ? cats.filter((c) => c !== category)
        : [...cats, category];
      dataset.setSearchFilters({ ...dataset.searchFilters, categories: next });
    },
    [dataset],
  );

  return (
    <Layout title="History">
      {/* Header bar */}
      <div className="history-header">
        <span className="history-count">
          {dataset.snapshot
            ? isFiltered
              ? `${totalRecords} total`
              : `${totalRecords} total · showing last ${visibleRecords.length}`
            : "Loading…"}
        </span>
        <button
          className="btn btn-secondary btn-inline"
          onClick={() => void dataset.reloadDataset().catch(() => undefined)}
          type="button"
          aria-label="Reload full sheet data"
          title="Reload full sheet data"
        >
          <RefreshCw size={14} aria-hidden className={dataset.status === "loading" ? "icon-spin" : ""} />
        </button>
      </div>

      {/* Background history loading banner */}
      {dataset.isLoadingHistory && (
        <StatusBanner variant="info" message="Complete history is still loading…" />
      )}

      {/* Comment input — always visible */}
      <div className="input-label mb-2">Comment</div>
      <div className="search-hero-input">
        <SearchIcon size={18} className="search-icon" aria-hidden />
        <input
          className="input"
          value={dataset.searchFilters.comment}
          onChange={(e) =>
            dataset.setSearchFilters({ ...dataset.searchFilters, comment: e.target.value })
          }
          placeholder="Search by words…"
          inputMode="text"
          aria-label="Filter by comment"
        />
        {dataset.searchFilters.comment !== "" && (
          <button
            className="search-hero-clear"
            type="button"
            aria-label="Clear comment"
            onClick={() =>
              dataset.setSearchFilters({ ...dataset.searchFilters, comment: "" })
            }
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter toggle */}
      <button
        className={`filter-toggle${panelFilterCount > 0 ? " filter-toggle--active" : ""}`}
        type="button"
        onClick={() => setFilterOpen((o) => !o)}
        aria-expanded={filterOpen}
      >
        <span>Filter</span>
        {panelFilterCount > 0 && (
          <span className="filter-toggle-badge">{panelFilterCount}</span>
        )}
        {filterOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>

      {/* Expandable filter panel */}
      {filterOpen && (
        <div className="filter-section">
          {/* Category chips */}
          {dataset.snapshot && (
            <>
              <div className="input-label mb-2">Category</div>
              <div className="category-chips mb-4">
                <button
                  type="button"
                  className={`category-chip${dataset.searchFilters.categories.length === 0 ? " active" : ""}`}
                  onClick={() =>
                    dataset.setSearchFilters({ ...dataset.searchFilters, categories: [] })
                  }
                >
                  All
                </button>
                {dataset.distinctValues.Category.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`category-chip${dataset.searchFilters.categories.includes(category) ? " active" : ""}`}
                    onClick={() => handleCategoryToggle(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Amount range */}
          <div className="input-label mb-2">Amount (USD)</div>
          <div className="filter-amount-range mb-4">
            <input
              className="input"
              type="number"
              placeholder="From"
              value={dataset.searchFilters.amountFrom}
              onChange={(e) =>
                dataset.setSearchFilters({ ...dataset.searchFilters, amountFrom: e.target.value })
              }
              min="0"
              aria-label="Minimum amount"
            />
            <input
              className="input"
              type="number"
              placeholder="To"
              value={dataset.searchFilters.amountTo}
              onChange={(e) =>
                dataset.setSearchFilters({ ...dataset.searchFilters, amountTo: e.target.value })
              }
              min="0"
              aria-label="Maximum amount"
            />
          </div>

          {/* Custom column text filters */}
          {config?.customColumns.map((col) => (
            <div key={col}>
              <div className="input-label mb-2">{col}</div>
              <div className="search-hero-input mb-4">
                <SearchIcon size={18} className="search-icon" aria-hidden />
                <input
                  className="input"
                  value={dataset.searchFilters.customFields[col] ?? ""}
                  onChange={(e) =>
                    dataset.setSearchFilters({
                      ...dataset.searchFilters,
                      customFields: { ...dataset.searchFilters.customFields, [col]: e.target.value },
                    })
                  }
                  placeholder={`Search ${col}…`}
                  inputMode="text"
                  aria-label={`Filter by ${col}`}
                />
              </div>
            </div>
          ))}

          {/* Clear all filters — inside the panel */}
          {isAnyFilterActive(dataset.searchFilters) && (
            <button
              className="btn btn-secondary btn-inline mb-4"
              type="button"
              onClick={handleClear}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Clear all filters — outside panel (shown when panel is collapsed but filters are active) */}
      {!filterOpen && isAnyFilterActive(dataset.searchFilters) && (
        <button
          className="btn btn-secondary btn-inline mb-4"
          type="button"
          onClick={handleClear}
        >
          Clear filters
        </button>
      )}

      {/* Error and loading */}
      {dataset.error ? <StatusBanner variant="error" message={dataset.error} /> : null}
      {dataset.status === "loading" ? <LoadingBlock label="Loading expenses…" variant="skeleton" /> : null}

      {/* Results */}
      {dataset.status === "ready" ? (
        isFiltered && outcome ? (
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
                    message={`Showing most recent 100 of ${outcome.allMatches.length} results. Refine your search to see older entries.`}
                  />
                ) : null}
                <ExpenseTable
                  records={outcome.visibleMatches}
                  emptyMessage="Nothing found."
                  sheetCurrencies={config?.currencies}
                  activeCurrencies={config?.currencies}
                  customColumns={config?.customColumns}
                  onEditRequest={handleEditRequest}
                  highlightedRowNumber={highlightedRowNumber}
                  savedRowNumber={savedRowNumber}
                  isViewOnly={isViewOnly}
                />
              </>
            )}
          </>
        ) : isFiltered && dataset.isLoadingHistory ? (
          <LoadingBlock label="Loading complete history before filtering\u2026" variant="skeleton" />
        ) : isFiltered ? (
          <StatusBanner variant="error" message="History failed to load \u2014 filter results may be incomplete. Try reloading." />
        ) : (
          <>
            <ExpenseTable
              records={visibleRecords}
              sheetCurrencies={config?.currencies}
              activeCurrencies={config?.currencies}
              customColumns={config?.customColumns}
              lastRecordRowNumber={lastRecord?.rowNumber}
              onDeleteRequest={setConfirmRecord}
              onEditRequest={handleEditRequest}
              highlightedRowNumber={highlightedRowNumber}
              savedRowNumber={savedRowNumber}
              isViewOnly={isViewOnly}
            />
            {canShowEarlier ? (
              <button
                className="btn btn-ghost show-earlier-link"
                type="button"
                disabled={showEarlierLoading}
                onClick={() => setPageSize((p) => p + HISTORY_PAGE_SIZE)}
              >
                {showEarlierLoading ? "Loading…" : "Show earlier"}
              </button>
            ) : null}
          </>
        )
      ) : null}

      {/* Delete confirmation dialog */}
      {confirmRecord ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-dialog">
            <h3 className="confirm-title" id="confirm-title">Delete expense?</h3>
            <div className="confirm-record-preview">
              <div className="confirm-preview-row">
                <span className="confirm-preview-label">Date</span>
                <span>{confirmRecord.Date}</span>
              </div>
              <div className="confirm-preview-row">
                <span className="confirm-preview-label">Amount</span>
                <span>{getDisplayAmountFull(confirmRecord, config?.currencies ?? [])}</span>
              </div>
              <div className="confirm-preview-row">
                <span className="confirm-preview-label">Category</span>
                <span>{confirmRecord.Category}</span>
              </div>
            </div>
            <p className="confirm-warning">This will permanently remove the row from your spreadsheet.</p>
            {deleteError ? <StatusBanner variant="error" message={deleteError} /> : null}
            <div className="confirm-actions">
              <button
                className="btn btn-secondary btn-inline"
                type="button"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-inline"
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={isDeleting}
                aria-busy={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
