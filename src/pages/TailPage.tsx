import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_TAIL_RECORDS } from "../constants/expenses";
import { ExpenseTable } from "../components/ExpenseTable";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";

export function TailPage(): JSX.Element {
  const { config } = useConfig();
  const dataset = useDataset();
  const navigate = useNavigate();

  useEffect(() => {
    if (!config) {
      navigate("/setup", { replace: true });
      return;
    }

    if (!dataset.snapshot && dataset.status !== "loading") {
      void dataset.loadDataset().catch(() => undefined);
    }
  }, [config, dataset, navigate]);

  const visibleRecords = useMemo(
    () => dataset.snapshot?.records.slice(-MAX_TAIL_RECORDS) ?? [],
    [dataset.snapshot?.records],
  );

  return (
    <Layout>
      <section className="card">
        <div className="page-header">
          <div className="page-header-top">
            <h1>Tail</h1>
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => void dataset.reloadDataset().catch(() => undefined)}
                type="button"
              >
                Reload
              </button>
              <button className="secondary-button" onClick={() => navigate(-1)} type="button">
                Back
              </button>
            </div>
          </div>
          <div>
            <p className="muted">Up to the last 20 expense rows in sheet order.</p>
          </div>
        </div>
        {dataset.error ? <StatusBanner variant="error" message={dataset.error} /> : null}
        {dataset.status === "loading" ? <LoadingBlock label="Loading expenses…" /> : null}
        {dataset.status === "ready" ? (
          <>
            <p className="muted small">
              Loaded {dataset.snapshot?.records.length ?? 0} records. Showing up to the last 20.
            </p>
            <ExpenseTable records={visibleRecords} />
          </>
        ) : null}
      </section>
    </Layout>
  );
}
