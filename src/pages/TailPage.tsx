import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { MAX_TAIL_RECORDS } from "../constants/expenses";
import { ExpenseTable } from "../components/ExpenseTable";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";

export function TailPage(): JSX.Element {
  const { config, isConfigLoading, error: configError } = useConfig();
  const dataset = useDataset();
  const navigate = useNavigate();

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
  }, [config, configError, isConfigLoading, dataset, navigate]);

  const visibleRecords = useMemo(
    () => dataset.snapshot?.records.slice(-MAX_TAIL_RECORDS) ?? [],
    [dataset.snapshot?.records],
  );

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
          <RefreshCw size={14} aria-hidden />
          Reload
        </button>
      </div>

      {dataset.error ? <StatusBanner variant="error" message={dataset.error} /> : null}

      {dataset.status === "loading" ? (
        <LoadingBlock label="Loading expenses…" variant="skeleton" />
      ) : null}

      {dataset.status === "ready" ? (
        <ExpenseTable records={visibleRecords} />
      ) : null}
    </Layout>
  );
}
