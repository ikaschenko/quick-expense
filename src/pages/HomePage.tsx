import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, Receipt } from "lucide-react";
import { FormattedAmount } from "../components/FormattedAmount";
import { Layout } from "../components/Layout";
import { MtdSpendChart } from "../components/MtdSpendChart";
import { useConfig } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";
import { useDataset } from "../contexts/DatasetContext";
import { getTodayLocalDate } from "../utils/date";
import {
  buildIsoNormalizer,
  getTodayStats,
  getMtdStats,
  getYtdStats,
  getRolling12mStats,
  getMtdDailyAmounts,
  getMtdWeekBoundaryPositions,
} from "../utils/dashboardStats";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFirstName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const name = local.split(/[._-]/)[0] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

interface EmptyStateProps {
  variant: "no-sheet" | "no-data";
}

function HomeEmptyState({ variant }: EmptyStateProps): JSX.Element {
  const isNoSheet = variant === "no-sheet";
  return (
    <div className="home-empty-state">
      {isNoSheet
        ? <FileSpreadsheet size={48} className="home-empty-state-icon" aria-hidden />
        : <Receipt size={48} className="home-empty-state-icon" aria-hidden />}
      <h2 className="home-empty-state-title">
        {isNoSheet ? "Almost ready!" : "No expenses yet"}
      </h2>
      <p className="home-empty-state-body">
        {isNoSheet
          ? "Connect a Google Sheet to start tracking expenses."
          : "Add your first one — it takes under 30 seconds — and this screen will show your spending summary."}
      </p>
      {!isNoSheet && (
        <div className="home-ghost-chart" aria-hidden>
          {[40, 65, 30, 80, 50, 70].map((h, i) => (
            <div key={i} className="home-ghost-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
      )}
      <Link to={isNoSheet ? "/setup" : "/add"} className="btn btn-primary home-empty-state-cta">
        {isNoSheet ? "Connect Sheet →" : "+ Add Expense"}
      </Link>
    </div>
  );
}

function MetricCardSkeleton(): JSX.Element {
  return <div className="skeleton-card" style={{ height: "120px" }} />;
}

export function HomePage(): JSX.Element {
  const { config, isConfigLoading } = useConfig();
  const { session } = useAuth();
  const dataset = useDataset();
  const firstName = session?.givenName ?? (session?.email ? getFirstName(session.email) : "");
  const today = useMemo(() => getTodayLocalDate(), []);

  // Load dataset when config is ready and dataset hasn't been loaded yet
  useEffect(() => {
    if (!config || isConfigLoading) return;
    if (dataset.status === "idle") {
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
    }
  }, [config, isConfigLoading, dataset.status, dataset.loadDataset]);

  const records = dataset.snapshot?.records ?? [];

  const toIso = useMemo(() => buildIsoNormalizer(records), [records]);

  const todayStats = useMemo(() => getTodayStats(records, today, toIso), [records, today, toIso]);
  const mtdStats = useMemo(() => getMtdStats(records, today, toIso), [records, today, toIso]);
  const ytdStats = useMemo(() => getYtdStats(records, today, toIso), [records, today, toIso]);
  const rolling12mStats = useMemo(() => getRolling12mStats(records, today, toIso), [records, today, toIso]);
  const mtdDailyAmounts = useMemo(() => getMtdDailyAmounts(records, today, toIso), [records, today, toIso]);

  const [year, month] = today.split("-").map(Number);
  const weekBoundaryPositions = useMemo(
    () => getMtdWeekBoundaryPositions(year, month),
    [year, month],
  );

  const monthName = new Date(year, month - 1, 1).toLocaleString("en", { month: "long" }).toUpperCase();
  const dayLabel = new Date(year, month - 1, parseInt(today.split("-")[2], 10))
    .toLocaleString("en", { month: "short", day: "numeric" });

  const isDatasetLoading = dataset.status === "idle" || dataset.status === "loading";
  const isLoading = isConfigLoading || isDatasetLoading;
  const showEmptySheet = !isConfigLoading && !config;
  const showEmptyData = !isLoading && config && dataset.status === "ready" && records.length === 0;
  const showDashboard = !isLoading && config && dataset.status === "ready" && records.length > 0;
  const showDashboardSkeleton = !isConfigLoading && config && isDatasetLoading;

  return (
    <Layout title="Quick Expense">
      <div className="home-wrapper">
        <p className="home-greeting">
          {getGreeting()}, {firstName} 👋
        </p>

        {isConfigLoading ? (
          <div className="skeleton-list">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        ) : showEmptySheet ? (
          <HomeEmptyState variant="no-sheet" />
        ) : showEmptyData ? (
          <HomeEmptyState variant="no-data" />
        ) : showDashboardSkeleton ? (
          <div className="skeleton-list">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <div className="home-metric-row">
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </div>
            <p className="home-loading-hint">Loading expenses from Google Sheet…</p>
          </div>
        ) : dataset.status === "error" ? (
          <div className="home-dataset-error">
            <p>Failed to load expense data.</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => dataset.reloadDataset().catch(() => {})}
            >
              Retry
            </button>
          </div>
        ) : showDashboard ? (
          <div className="home-dashboard">
            {/* TODAY */}
            <div className="home-metric-card">
              <div className="home-metric-header">
                <span className="home-metric-title">TODAY · {dayLabel}</span>
                <Link to="/tail" className="home-metric-link">
                  {todayStats.count} {todayStats.count === 1 ? "entry" : "entries"} →
                </Link>
              </div>
              {todayStats.count === 0 ? (
                <p className="home-metric-empty">No expense entries</p>
              ) : (
                <p className="home-metric-amount">
                  {todayStats.dualCurrency ? (
                    <>
                      <FormattedAmount prefix={`${todayStats.dualCurrency.code} `} value={todayStats.dualCurrency.amount} />
                      {" / "}
                      <FormattedAmount prefix="$" value={todayStats.usdTotal} />
                    </>
                  ) : (
                    <FormattedAmount prefix="$" value={todayStats.usdTotal} />
                  )}
                </p>
              )}
            </div>

            {/* MTD */}
            <div className="home-metric-card">
              <div className="home-metric-header">
                <span className="home-metric-title">{monthName} SO FAR</span>
                <Link to="/tail" className="home-metric-link">
                  {mtdStats.count} {mtdStats.count === 1 ? "entry" : "entries"} →
                </Link>
              </div>
              {mtdStats.count === 0 ? (
                <p className="home-metric-empty">No expense entries</p>
              ) : (
                <>
                  <p className="home-metric-amount"><FormattedAmount prefix="$" value={mtdStats.usdTotal} /></p>
                  {mtdStats.deviation && (
                    <p className="home-metric-yoy">
                      {mtdStats.deviation.up ? "▲" : "▼"}{" "}
                      {mtdStats.deviation.up ? "+" : "-"}{mtdStats.deviation.pctChange}% ·{" "}
                      {mtdStats.deviation.up ? "+" : "-"}${mtdStats.deviation.absChange.toFixed(2)} vs {mtdStats.deviation.priorLabel}
                    </p>
                  )}
                  <MtdSpendChart
                    dailyAmounts={mtdDailyAmounts}
                    weekBoundaryPositions={weekBoundaryPositions}
                  />
                </>
              )}
            </div>

            {/* YTD + ROLLING 12M */}
            <div className="home-metric-row">
              <div className="home-metric-card">
                <div className="home-metric-header">
                  <span className="home-metric-title">{year} SO FAR</span>
                </div>
                {ytdStats.count === 0 ? (
                  <p className="home-metric-empty">No expense entries</p>
                ) : (
                  <>
                    <p className="home-metric-amount"><FormattedAmount prefix="$" value={ytdStats.usdTotal} /></p>
                    {ytdStats.deviation && (
                      <p className="home-metric-yoy">
                        {ytdStats.deviation.up ? "▲" : "▼"}{" "}
                        {ytdStats.deviation.up ? "+" : "-"}{ytdStats.deviation.pctChange}% ·{" "}
                        {ytdStats.deviation.up ? "+" : "-"}${ytdStats.deviation.absChange.toFixed(2)} vs {ytdStats.deviation.priorLabel}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* ROLLING 12M */}
              <div className="home-metric-card">
                <div className="home-metric-header">
                  <span className="home-metric-title">ROLLING 12M</span>
                </div>
                {rolling12mStats.count === 0 ? (
                  <p className="home-metric-empty">No expense entries</p>
                ) : (
                  <>
                    <p className="home-metric-amount"><FormattedAmount prefix="$" value={rolling12mStats.usdTotal} /></p>
                    {rolling12mStats.deviation && (
                      <p className="home-metric-yoy">
                        {rolling12mStats.deviation.up ? "▲" : "▼"}{" "}
                        {rolling12mStats.deviation.up ? "+" : "-"}{rolling12mStats.deviation.pctChange}% ·{" "}
                        {rolling12mStats.deviation.up ? "+" : "-"}${rolling12mStats.deviation.absChange.toFixed(2)} vs {rolling12mStats.deviation.priorLabel}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <a
          href="https://buymeacoffee.com/qexpensesux"
          target="_blank"
          rel="noreferrer"
          className="home-support-link"
        >
          <img src="/bmc-logo.svg" alt="Buy Me a Coffee" height="22" aria-hidden style={{ verticalAlign: "middle", marginRight: "6px" }} />
          Like Quick Expense? Support the project
        </a>
      </div>
    </Layout>
  );
}

