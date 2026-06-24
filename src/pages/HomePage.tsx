import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileSpreadsheet, Receipt } from "lucide-react";
import { FormattedAmount } from "../components/FormattedAmount";
import { Layout } from "../components/Layout";
import { MtdSpendChart } from "../components/MtdSpendChart";
import { StatusBanner } from "../components/StatusBanner";
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
import { metricsCache, type MetricsCacheEntry } from "../services/metricsCache";
import { googleSheetsService } from "../services/googleSheets";

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

interface DeviationProps {
  deviation: { up: boolean; pctChange: number; absChange: number; priorLabel: string };
}

function DeviationLine({ deviation }: DeviationProps): JSX.Element {
  const isGrowing = deviation.up && deviation.absChange > 0;
  const sign = deviation.up ? "+" : "-";
  const arrow = deviation.up ? "▲" : "▼";
  return (
    <p className="home-metric-yoy">
      <span className={isGrowing ? "yoy-up" : "yoy-down"}>
        {arrow} {sign}{deviation.pctChange}% ({sign}${Math.round(deviation.absChange)})
      </span>{" "}
      vs {deviation.priorLabel}
    </p>
  );
}

export function HomePage(): JSX.Element {
  const { config, isConfigLoading } = useConfig();
  const { session } = useAuth();
  const dataset = useDataset();
  const location = useLocation();
  const firstName = session?.givenName ?? (session?.email ? getFirstName(session.email) : "");
  const today = useMemo(() => getTodayLocalDate(), []);

  const [cachedEntry, setCachedEntry] = useState<MetricsCacheEntry | null>(null);
  const [cacheChecking, setCacheChecking] = useState(false);
  const driveModifiedTimeRef = useRef<string | null>(null);

  const [showSavedBanner, setShowSavedBanner] = useState(
    !!(location.state as { expenseSaved?: boolean } | null)?.expenseSaved,
  );

  useEffect(() => {
    if (!showSavedBanner) return;
    const timer = setTimeout(() => setShowSavedBanner(false), 4000);
    return () => clearTimeout(timer);
  }, [showSavedBanner]);

  // Unified: read cache → validate with Drive → or load from API if stale/absent.
  // Single effect prevents the race where a separate load-trigger effect fires before
  // the drive-check effect's setState calls take effect, causing a spurious full reload
  // on cache-hit page refreshes.
  useEffect(() => {
    if (!session?.email || !config?.spreadsheetId || isConfigLoading) return;
    if (dataset.status !== "idle") return; // already loaded this session — nothing to do

    const entry = metricsCache.load(session.email);

    if (!entry) {
      // No valid same-day cache — load from the API immediately.
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
      return;
    }

    // Cache hit — render it instantly and validate freshness with Drive in the background.
    setCachedEntry(entry);
    setCacheChecking(true);
    googleSheetsService.getSheetModifiedTime()
      .then(({ modifiedTime }) => {
        driveModifiedTimeRef.current = modifiedTime;
        const isStale =
          modifiedTime === null ||
          entry.sheetLastModifiedTime === null ||
          modifiedTime > entry.sheetLastModifiedTime;
        if (isStale) {
          setCachedEntry(null);
          dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
        }
      })
      .catch(() => {
        setCachedEntry(null);
        dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
      })
      .finally(() => setCacheChecking(false));
  }, [session?.email, config?.spreadsheetId, isConfigLoading, dataset.status, dataset.loadDataset]);

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

  // Write metrics to localStorage whenever live data is ready or mutated.
  useEffect(() => {
    if (!session?.email || dataset.status !== "ready") return;
    metricsCache.save(session.email, {
      cacheDate: today,
      sheetLastModifiedTime: driveModifiedTimeRef.current ?? new Date().toISOString(),
      todayStats,
      mtdStats,
      ytdStats,
      rolling12mStats,
      mtdDailyAmounts,
      weekBoundaryPositions,
    });
    driveModifiedTimeRef.current = null;
  }, [dataset.status, todayStats, mtdStats, ytdStats, rolling12mStats]);

  const monthName = new Date(year, month - 1, 1).toLocaleString("en", { month: "long" }).toUpperCase();
  const dayLabel = new Date(year, month - 1, parseInt(today.split("-")[2], 10))
    .toLocaleString("en", { month: "short", day: "numeric" });

  const isDatasetLoading = dataset.status === "idle" || dataset.status === "loading";
  const isLoading = isConfigLoading || isDatasetLoading;
  const showEmptySheet = !isConfigLoading && !config;
  const showEmptyData = !cachedEntry && !isLoading && config && dataset.status === "ready" && records.length === 0;
  const showDashboard = cachedEntry !== null || (!isLoading && config && dataset.status === "ready" && records.length > 0);
  const showDashboardSkeleton = !cachedEntry && !isConfigLoading && config && isDatasetLoading;

  // Prefer live computed values; fall back to cache when dataset is still idle.
  const displayTodayStats = cachedEntry?.todayStats ?? todayStats;
  const displayMtdStats = cachedEntry?.mtdStats ?? mtdStats;
  const displayYtdStats = cachedEntry?.ytdStats ?? ytdStats;
  const displayRolling12mStats = cachedEntry?.rolling12mStats ?? rolling12mStats;
  const displayMtdDailyAmounts = cachedEntry?.mtdDailyAmounts ?? mtdDailyAmounts;
  const displayWeekBoundaryPositions = cachedEntry?.weekBoundaryPositions ?? weekBoundaryPositions;

  return (
    <Layout title="Quick Expense">
      {showSavedBanner ? (
        <StatusBanner variant="success" message="Expense saved successfully." />
      ) : null}
      {cacheChecking ? (
        <StatusBanner variant="info" message="Refreshing…" />
      ) : null}
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
                  {displayTodayStats.count} {displayTodayStats.count === 1 ? "entry" : "entries"} →
                </Link>
              </div>
              {displayTodayStats.count === 0 ? (
                <p className="home-metric-empty">No expense entries</p>
              ) : (
                <p className="home-metric-amount">
                  {displayTodayStats.dualCurrency ? (
                    <>
                      <FormattedAmount prefix={`${displayTodayStats.dualCurrency.code} `} value={displayTodayStats.dualCurrency.amount} />
                      {" / "}
                      <FormattedAmount prefix="$" value={displayTodayStats.usdTotal} />
                    </>
                  ) : (
                    <FormattedAmount prefix="$" value={displayTodayStats.usdTotal} />
                  )}
                </p>
              )}
            </div>

            {/* MTD */}
            <div className="home-metric-card">
              <div className="home-metric-header">
                <span className="home-metric-title">{monthName} SO FAR</span>
                <Link to="/tail" className="home-metric-link">
                  {displayMtdStats.count} {displayMtdStats.count === 1 ? "entry" : "entries"} →
                </Link>
              </div>
              {displayMtdStats.count === 0 ? (
                <p className="home-metric-empty">No expense entries</p>
              ) : (
                <>
                  <p className="home-metric-amount"><FormattedAmount prefix="$" value={displayMtdStats.usdTotal} /></p>
                  {displayMtdStats.deviation && <DeviationLine deviation={displayMtdStats.deviation} />}
                  <MtdSpendChart
                    dailyAmounts={displayMtdDailyAmounts}
                    weekBoundaryPositions={displayWeekBoundaryPositions}
                    year={year}
                    month={month}
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
                {displayYtdStats.count === 0 ? (
                  <p className="home-metric-empty">No expense entries</p>
                ) : (
                  <>
                    <p className="home-metric-amount"><FormattedAmount prefix="$" value={displayYtdStats.usdTotal} /></p>
                    {displayYtdStats.deviation && <DeviationLine deviation={displayYtdStats.deviation} />}
                  </>
                )}
              </div>

              {/* ROLLING 12M */}
              <div className="home-metric-card">
                <div className="home-metric-header">
                  <span className="home-metric-title">ROLLING 12M EXPENSES</span>
                </div>
                {displayRolling12mStats.count === 0 ? (
                  <p className="home-metric-empty">No expense entries</p>
                ) : (
                  <>
                    <p className="home-metric-amount"><FormattedAmount prefix="$" value={displayRolling12mStats.usdTotal} /></p>
                    {displayRolling12mStats.deviation && <DeviationLine deviation={displayRolling12mStats.deviation} />}
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

