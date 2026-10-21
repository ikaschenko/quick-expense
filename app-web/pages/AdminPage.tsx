import { AppActivityTracker } from "../components/AppActivityTracker";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, RefreshCw, Shield } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { adminApi } from "../services/adminApi";
import type { AdminUsageMetrics, MetricChange } from "../types/expense";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", timeZoneName: undefined });
}

function Percent({ value }: { value: number }): JSX.Element {
  return <>{value.toFixed(1)}%</>;
}

function Trend({ value }: { value: MetricChange }): JSX.Element {
  if (value.kind === "unavailable") return <span className="admin-trend admin-trend-neutral">Comparison unavailable</span>;
  if (value.kind === "no-previous-activity") return <span className="admin-trend admin-trend-neutral">No previous activity · +{value.absolute}</span>;
  if (value.kind === "no-change") return <span className="admin-trend admin-trend-neutral">No change</span>;
  const increase = value.kind === "increase";
  return (
    <span className={`admin-trend ${increase ? "admin-trend-up" : "admin-trend-down"}`}>
      {increase ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
      <span>{increase ? "+" : "−"}{Math.abs(value.percent ?? 0).toFixed(1)}% ({increase ? "+" : "−"}{Number.isInteger(value.absolute) ? Math.abs(value.absolute ?? 0) : Math.abs(value.absolute ?? 0).toFixed(1)})</span>
    </span>
  );
}

function MetricCard({ title, value, detail, trend }: { title: string; value: string | number; detail?: string; trend?: MetricChange }): JSX.Element {
  return (
    <article className="admin-metric-card">
      <h3>{title}</h3>
      <p className="admin-metric-value">{value}</p>
      {detail ? <p className="admin-metric-detail">{detail}</p> : null}
      {trend ? <Trend value={trend} /> : null}
    </article>
  );
}

function PeriodLabel({ metrics }: { metrics: AdminUsageMetrics }): JSX.Element {
  const { current, previous } = metrics.periods;
  return (
    <p className="admin-periods">
      Current: {formatDate(current.start)} – {formatDate(current.end)} ({metrics.coverage.current === "complete" ? "Complete" : metrics.coverage.current === "unavailable" ? "Unavailable" : "Observed partial counts"}) · Previous: {formatDate(previous.start)} – {formatDate(previous.end)} ({metrics.coverage.previous === "complete" ? "Complete" : metrics.coverage.previous === "unavailable" ? "Unavailable" : "Observed partial counts"}) · UTC
    </p>
  );
}

export function AdminPage(): JSX.Element {
  const auth = useAuth();
  const [metrics, setMetrics] = useState<AdminUsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const fresh = await adminApi.getUsageMetrics();
      setMetrics(fresh);
      setStale(false);
    } catch (loadError) {
      const message = (loadError as Error).message || "Metrics could not be loaded.";
      setError(message);
      setStale(metrics !== null);
      if ((loadError as { status?: number }).status === 401 || (loadError as { status?: number }).status === 403) {
        setMetrics(null);
        setStale(false);
        await auth.refreshSession();
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth, metrics]);

  const entryLoadStarted = useRef(false);
  useEffect(() => {
    if (entryLoadStarted.current) return;
    entryLoadStarted.current = true;
    void refresh(true);
  }, [refresh]);

  const setupLabels: Array<[keyof AdminUsageMetrics["users"]["setup"], string]> = [
    ["created", "Created using QuickExpense"],
    ["existing", "Connected an existing spreadsheet"],
    ["shared", "Shared setup"],
    ["unknown", "Unknown / legacy setup type"],
    ["none", "No connected setup"],
  ];
  const currentCoverage = metrics?.coverage.current === "complete";
  const priorCoverage = metrics?.coverage.previous === "complete";
  const periodCoverage = currentCoverage && priorCoverage;

  return (
    <main className="admin-page">
      <AppActivityTracker />
      <header className="admin-page-header">
        <div><p className="admin-eyebrow"><Shield size={15} aria-hidden /> Administration</p><h1>QuickExpense Administration Panel</h1></div>
        <div className="admin-header-actions">
          <Link className="btn btn-secondary btn-inline" to="/home">Back to app</Link>
          <button className="btn btn-ghost btn-inline" type="button" onClick={auth.signOut}>Sign out</button>
        </div>
      </header>

      <div className="admin-toolbar">
        {metrics ? <span>Updated at {new Date(metrics.snapshotAt).toLocaleString(undefined, { timeZone: "UTC" })} UTC{stale ? " · Stale values" : ""}</span> : <span role="status">{loading ? "Loading usage metrics…" : "Metrics unavailable"}</span>}
        <button type="button" className="btn btn-secondary btn-inline" onClick={() => void refresh(false)} disabled={refreshing}>
          <RefreshCw size={16} aria-hidden />{refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error ? <div className="admin-error" role="alert"><span>{error}{stale ? " Previous values are retained and marked stale." : ""}</span><button className="btn btn-secondary btn-sm" onClick={() => void refresh(false)} type="button">Retry</button></div> : null}
      {loading && !metrics ? <div className="admin-loading" role="status" aria-live="polite">Loading administration metrics…</div> : null}
      {!metrics && !loading ? <div className="admin-loading" role="status">No metrics are available. Retry to try again.</div> : null}

      {metrics ? <>
        {stale ? <div className="admin-stale" role="status">Showing the last successful snapshot; this data may be stale.</div> : null}
        <section className="admin-section" aria-labelledby="admin-users-heading">
          <h2 id="admin-users-heading">Users and setup adoption</h2>
          <div className="admin-metric-grid">
            <MetricCard title="Total users" value={metrics.users.total} />
            <MetricCard title="Currently connected users" value={metrics.users.connected.count} detail={`${metrics.users.connected.percent.toFixed(1)}% of all users`} />
          </div>
          <div className="admin-setup-list" aria-label="Current setup adoption breakdown">
            {setupLabels.map(([key, label]) => {
              const item = metrics.users.setup[key];
              return <div className={`admin-setup-row${key === "none" ? " admin-no-setup" : ""}`} key={key}><span>{label}</span><strong>{item.count} <small>(<Percent value={item.percent} />)</small></strong></div>;
            })}
          </div>
          <p className="admin-note">Connection status reflects saved application records only; a saved connection does not guarantee current Google access. Legacy saved candidates are not counted until successfully validated.</p>
        </section>

        <section className="admin-section" aria-labelledby="admin-adoption-heading">
          <h2 id="admin-adoption-heading">Recent adoption</h2>
          <PeriodLabel metrics={metrics} />
          {!periodCoverage ? <p className="admin-coverage" role="status">Insufficient history for one or both complete periods. Unobserved periods are unavailable; partially observed periods show observed counts only. Comparisons are withheld.</p> : null}
          <div className="admin-metric-grid">
            <MetricCard title="Active users · last 30 days" value={metrics.users.active.current ?? "Unavailable"} detail={`Previous period: ${metrics.users.active.previous ?? "Unavailable"}`} trend={periodCoverage ? metrics.users.active.change : { kind: "unavailable" }} />
            <MetricCard title="New users · last 30 days" value={metrics.users.new.current ?? "Unavailable"} detail={`Previous period: ${metrics.users.new.previous ?? "Unavailable"}`} trend={metrics.users.new.change} />
          </div>
        </section>

        <section className="admin-section" aria-labelledby="admin-sessions-heading">
          <h2 id="admin-sessions-heading">Usage sessions</h2>
          <PeriodLabel metrics={metrics} />
          {!periodCoverage ? <p className="admin-coverage">Session values are observed counts; complete-period averages and comparisons are unavailable until sufficient history is collected.</p> : null}
          <div className="admin-metric-grid">
            <MetricCard title="Since tracking began" value={metrics.sessions.lifetime} />
            <MetricCard title="Sessions · last 30 days" value={metrics.sessions.current ?? "Unavailable"} detail={`Previous period: ${metrics.sessions.previous ?? "Unavailable"}`} trend={periodCoverage ? metrics.sessions.change : { kind: "unavailable" }} />
            <MetricCard title="Average sessions per day" value={metrics.sessions.averagePerDay.current === null ? "Insufficient history" : metrics.sessions.averagePerDay.current.toFixed(1)} detail={`Previous period: ${metrics.sessions.averagePerDay.previous === null ? "Insufficient history" : metrics.sessions.averagePerDay.previous.toFixed(1)}`} trend={periodCoverage ? metrics.sessions.averageChange : { kind: "unavailable" }} />
          </div>
          <p className="admin-note">Tracking started {metrics.trackingStartedAt ? new Date(metrics.trackingStartedAt).toLocaleDateString(undefined, { timeZone: "UTC" }) : "not yet enabled"} (UTC). A session starts on an authenticated screen visit and continues with activity less than 30 minutes apart.</p>
        </section>

        {metrics.coverageGaps?.length ? <section className="admin-section" aria-label="Tracking coverage gaps">
          <h2>Tracking coverage gaps</h2>
          <ul>{metrics.coverageGaps.map((gap, index) => <li key={index}>{new Date(gap.start).toISOString()} – {new Date(gap.end).toISOString()}</li>)}</ul>
        </section> : null}
        <section className="admin-section" aria-labelledby="admin-operations-heading">
          <h2 id="admin-operations-heading">Operations</h2>
          <p>Application logs are available in the existing guarded log viewer.</p>
          <a className="btn btn-primary btn-inline" href="/logs">View server logs</a>
        </section>
      </> : null}
    </main>
  );
}
