import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { MAX_TAIL_RECORDS } from "../constants/expenses";
import { ExpenseTable } from "../components/ExpenseTable";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { googleSheetsService } from "../services/googleSheets";
import { getDisplayAmountFull } from "../utils/expenseTable";
import { ExpenseRecord } from "../types/expense";

export function TailPage(): JSX.Element {
  const { config, isConfigLoading, error: configError } = useConfig();
  const dataset = useDataset();
  const { session } = useAuth();
  const isViewOnly = session?.guestAccessLevel === 'view';
  const navigate = useNavigate();

  const [confirmRecord, setConfirmRecord] = useState<ExpenseRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const location = useLocation();
  const [highlightedRowNumber, setHighlightedRowNumber] = useState<number | null>(
    (location.state as { editResult?: { rowNumber: number; saved: boolean } } | null)?.editResult?.rowNumber ?? null,
  );
  const [savedRowNumber, setSavedRowNumber] = useState<number | null>(
    (location.state as { editResult?: { rowNumber: number; saved: boolean } } | null)?.editResult?.saved
      ? ((location.state as { editResult: { rowNumber: number } }).editResult.rowNumber)
      : null,
  );

  useEffect(() => {
    if (savedRowNumber === null) return;
    const timer = setTimeout(() => setSavedRowNumber(null), 4000);
    return () => clearTimeout(timer);
  }, [savedRowNumber]);

  const handleEditRequest = useCallback((record: ExpenseRecord) => {
    navigate(`/edit/${record.rowNumber}`, { state: { record, origin: "/tail" } });
  }, [navigate]);

  useEffect(() => {
    // Only redirect to setup if config is truly missing AND not loading/errored
    if (!config && !isConfigLoading && !configError) {
      navigate("/setup", { replace: true });
      return;
    }

    // Load dataset if config exists, not loading, and no errors
    if (config && !dataset.snapshot && dataset.status !== "loading") {
      void dataset.loadDataset().catch(() => undefined);
    }
  }, [config, configError, isConfigLoading, dataset.snapshot, dataset.status, dataset.loadDataset, navigate]);

  const visibleRecords = useMemo(
    () => dataset.snapshot?.records.slice(-MAX_TAIL_RECORDS) ?? [],
    [dataset.snapshot?.records],
  );

  const lastRecord = visibleRecords.at(-1) ?? null;

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

  return (
    <Layout title="History">
      <div className="tail-header">
        <span className="tail-count">
          {dataset.snapshot
            ? `${dataset.snapshot.records.length} total · showing last ${visibleRecords.length}`
            : "Loading…"}
        </span>
        <button
          className="btn btn-secondary btn-inline"
          onClick={() => void dataset.reloadDataset().catch(() => undefined)}
          type="button"
          aria-label="Reload expenses"
        >
          <RefreshCw size={14} aria-hidden className={dataset.status === "loading" ? "icon-spin" : ""} />
          Reload
        </button>
      </div>

      {dataset.error ? <StatusBanner variant="error" message={dataset.error} /> : null}

      {dataset.status === "loading" ? (
        <LoadingBlock label="Loading expenses…" variant="skeleton" />
      ) : null}

      {dataset.status === "ready" ? (
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
      ) : null}

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
