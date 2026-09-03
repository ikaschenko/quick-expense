import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileSpreadsheet, Info, Loader2, Receipt } from "lucide-react";
import { FormattedAmount } from "../components/FormattedAmount";
import { Layout } from "../components/Layout";
import { MtdSpendChart } from "../components/MtdSpendChart";
import { MonthDetailsPanel } from "../components/MonthDetailsPanel";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";
import { useDataset } from "../contexts/DatasetContext";
import { getTodayLocalDate } from "../utils/date";
import {
  buildIsoNormalizer,
  getTodayStats,
  getMtdStats,
  getMonthRange,
  getMonthStats,
  getYtdStats,
  getYtdForecast,
  getRolling12mStats,
  getMtdDailyAmounts,
  getMtdWeekBoundaryPositions,
  formatPctChange,
  shiftMonth,
} from "../utils/dashboardStats";
import { metricsCache, type MetricsCacheEntry } from "../services/metricsCache";
import { googleSheetsService } from "../services/googleSheets";

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

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleString("en", { month: "short", day: "numeric" });
}

// Shown in place of cached values that a date rollover has invalidated, while the refresh runs.
function MetricRefreshing(): JSX.Element {
  return (
    <p className="home-metric-refreshing" role="status">
      <Loader2 size={14} className="icon-spin" aria-hidden />
      Updating…
    </p>
  );
}

interface DeviationProps {
  deviation: { up: boolean; pctChange: number; absChange: number; priorLabel: string; priorTotal: number };
}

function DeviationLine({ deviation }: DeviationProps): JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false);
  const isGrowing = deviation.up && deviation.absChange > 0;
  const sign = deviation.up ? "+" : "-";
  const arrow = deviation.up ? "▲" : "▼";
  return (
    <p className="home-metric-yoy">
      <span className={isGrowing ? "yoy-up" : "yoy-down"}>
        {arrow} {sign}{formatPctChange(deviation.pctChange)}% ({sign}${Math.round(deviation.absChange)})
      </span>{" "}
      <span className="prior-period-wrapper">
        <button
          type="button"
          className="prior-period-label"
          onClick={() => setShowTooltip((v) => !v)}
          aria-label={`Show ${deviation.priorLabel} total`}
        >
          vs {deviation.priorLabel}
        </button>
        {showTooltip && (
          <span className="prior-tooltip" role="tooltip">
            <FormattedAmount prefix="$" value={deviation.priorTotal} />
          </span>
        )}
      </span>
    </p>
  );
}

const TODAY_HELP_TEXT = "Total amount of expenses for today.";
const MTD_HELP_TEXT =
  "Total amount of expenses for the ongoing month, compared to the same date range for the previous month (shown only when comparable prior-month data exists).";
const YTD_HELP_TEXT =
  "Total amount of expenses for the ongoing year, compared to the same date range for the previous year (if enough data). The forecast projects your full-year total from your recent daily spending rate.";
const ROLLING_12M_HELP_TEXT =
  "Total amount of expenses over the trailing 12 months (up to yesterday), compared to the preceding 12-month period (shown when that data exists).";

interface WidgetHelpButtonProps {
  label: string;
  open: boolean;
  onToggle: () => void;
}

function WidgetHelpButton({ label, open, onToggle }: WidgetHelpButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className="section-help-btn"
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} info about ${label}`}
      onClick={onToggle}
    >
      <Info size={14} aria-hidden />
    </button>
  );
}

export function HomePage(): JSX.Element {
  const { config, isConfigLoading } = useConfig();
  const { session } = useAuth();
  const dataset = useDataset();
  const location = useLocation();
  const navigate = useNavigate();
  const today = useMemo(() => getTodayLocalDate(), []);
  const currentMonth = today.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [cachedEntry, setCachedEntry] = useState<MetricsCacheEntry | null>(null);
  const driveModifiedTimeRef = useRef<string | null>(null);

  const [todayHelpOpen, setTodayHelpOpen] = useState(false);
  const [mtdHelpOpen, setMtdHelpOpen] = useState(false);
  const [ytdHelpOpen, setYtdHelpOpen] = useState(false);
  const [rolling12mHelpOpen, setRolling12mHelpOpen] = useState(false);
  const [monthDetailsOpen, setMonthDetailsOpen] = useState(false);

  const [showSavedBanner, setShowSavedBanner] = useState(
    !!(location.state as { expenseSaved?: boolean } | null)?.expenseSaved,
  );

  // Browsers persist history.state across reloads — strip it so a refresh doesn't re-show the banner.
  useEffect(() => {
    if ((location.state as { expenseSaved?: boolean } | null)?.expenseSaved) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const entry = metricsCache.load(session.email, config.spreadsheetId);

    if (!entry) {
      // No valid cache for this sheet — load from the API immediately.
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
      return;
    }

    // Cache hit — render it instantly.
    setCachedEntry(entry);

    if (entry.cacheDate !== today) {
      // A date rollover invalidates TODAY/MTD regardless of sheet edits, so the Drive
      // freshness check would buy nothing — refresh unconditionally.
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
      return;
    }

    // Same-day cache — validate freshness with Drive in the background.
    googleSheetsService.getSheetModifiedTime()
      .then(({ modifiedTime }) => {
        driveModifiedTimeRef.current = modifiedTime;
        const isStale =
          modifiedTime === null ||
          entry.sheetLastModifiedTime === null ||
          modifiedTime > entry.sheetLastModifiedTime;
        if (isStale) {
          dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
        }
      })
      .catch(() => {
        dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
      });
  }, [session?.email, config?.spreadsheetId, isConfigLoading, today, dataset.status, dataset.loadDataset]);

  // Clear the cached entry once live data is ready so live values take over.
  useEffect(() => {
    if (dataset.status === "ready") setCachedEntry(null);
  }, [dataset.status]);

  // Month details relies on live records — a fresh metrics cache can leave dataset.status
  // "idle" indefinitely, so force a load once the panel is expanded.
  useEffect(() => {
    if (monthDetailsOpen && dataset.status !== "ready") {
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
    }
  }, [monthDetailsOpen, dataset.status, dataset.loadDataset]);

  useEffect(() => {
    if (selectedMonth !== currentMonth && dataset.status === "idle") {
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
    }
  }, [selectedMonth, currentMonth, dataset.status, dataset.loadDataset]);

  const records = dataset.snapshot?.records ?? [];

  const toIso = useMemo(() => buildIsoNormalizer(records), [records]);

  const todayStats = useMemo(() => getTodayStats(records, today, toIso), [records, today, toIso]);
  const mtdStats = useMemo(() => getMtdStats(records, today, toIso), [records, today, toIso]);
  const selectedMonthStats = useMemo(() => getMonthStats(records, selectedMonth, toIso), [records, selectedMonth, toIso]);
  const ytdStats = useMemo(() => getYtdStats(records, today, toIso), [records, today, toIso]);
  const ytdForecast = useMemo(() => getYtdForecast(records, today, toIso), [records, today, toIso]);
  const rolling12mStats = useMemo(() => getRolling12mStats(records, today, toIso), [records, today, toIso]);
  const currentMtdDailyAmounts = useMemo(() => getMtdDailyAmounts(records, currentMonth, toIso, today), [records, currentMonth, toIso, today]);
  const selectedMtdDailyAmounts = useMemo(() => getMtdDailyAmounts(records, selectedMonth, toIso, today), [records, selectedMonth, toIso, today]);

  const [year, month] = selectedMonth.split("-").map(Number);
  const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);
  const weekBoundaryPositions = useMemo(
    () => getMtdWeekBoundaryPositions(currentYear, currentMonthNumber),
    [currentYear, currentMonthNumber],
  );

  // Write metrics to localStorage whenever live data is ready or mutated.
  useEffect(() => {
    if (!session?.email || dataset.status !== "ready") return;
    metricsCache.save(session.email, {
      cacheDate: today,
      spreadsheetId: config?.spreadsheetId ?? "",
      sheetLastModifiedTime: driveModifiedTimeRef.current ?? new Date().toISOString(),
      todayStats,
      mtdStats,
      ytdStats,
      ytdForecast,
      rolling12mStats,
      mtdDailyAmounts: currentMtdDailyAmounts,
      weekBoundaryPositions,
    });
    driveModifiedTimeRef.current = null;
  }, [dataset.status, todayStats, mtdStats, ytdStats, ytdForecast, rolling12mStats]);

  const monthName = new Date(year, month - 1, 1).toLocaleString("en", { month: "long" }).toUpperCase();
  const dayLabel = formatShortDate(today);
  const selectedMonthRange = getMonthRange(selectedMonth);

  const isDatasetLoading = dataset.status === "idle" || dataset.status === "loading";
  const isLoading = isConfigLoading || isDatasetLoading;
  const showEmptySheet = !isConfigLoading && !config;
  const showEmptyData = !cachedEntry && !isLoading && config && dataset.status === "ready" && records.length === 0;
  const showDashboard = cachedEntry !== null || (!isLoading && config && dataset.status === "ready" && records.length > 0);
  const showDashboardSkeleton = !cachedEntry && !isConfigLoading && config && isDatasetLoading;
  const earliestLoadedMonth = records.reduce<string | null>((earliest, record) => {
    const iso = toIso(record.Date);
    const recordMonth = iso?.slice(0, 7) ?? null;
    return recordMonth && (!earliest || recordMonth < earliest) ? recordMonth : earliest;
  }, null);
  const isSelectedMonthLoading =
    (selectedMonth !== currentMonth && dataset.status !== "ready") ||
    (dataset.isLoadingHistory && (!earliestLoadedMonth || selectedMonth < earliestLoadedMonth));

  // A cached entry from an earlier day still carries valid YTD/rolling-12m totals, but its
  // TODAY (and, across a month boundary, MTD) figures are definitively wrong.
  const isStaleDay = cachedEntry !== null && cachedEntry.cacheDate !== today;
  const isStaleMonth = cachedEntry !== null && cachedEntry.cacheDate.slice(0, 7) !== today.slice(0, 7);
  const cacheDateLabel = isStaleDay ? formatShortDate(cachedEntry.cacheDate) : null;

  // Prefer live computed values; fall back to cache when dataset is still idle.
  const displayTodayStats = cachedEntry?.todayStats ?? todayStats;
  const displayMtdStats = cachedEntry?.mtdStats ?? mtdStats;
  const displaySelectedMtdStats = selectedMonth === currentMonth ? displayMtdStats : selectedMonthStats;
  const displayYtdStats = cachedEntry?.ytdStats ?? ytdStats;
  const displayYtdForecast = cachedEntry?.ytdForecast ?? ytdForecast;
  const displayRolling12mStats = cachedEntry?.rolling12mStats ?? rolling12mStats;
  const displayMtdDailyAmounts = cachedEntry?.mtdDailyAmounts ?? currentMtdDailyAmounts;
  const displayWeekBoundaryPositions = cachedEntry?.weekBoundaryPositions ?? weekBoundaryPositions;

  return (
    <Layout title="Quick Expense">
      {showSavedBanner ? (
        <StatusBanner variant="success" message="Expense saved successfully." />
      ) : null}
      <div className="home-wrapper">
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
          <div className={`home-dashboard${isStaleDay ? " home-dashboard--stale" : ""}`}>
            {isStaleDay && (
              <p className="home-stale-hint" role="status">
                Updating… · as of {cacheDateLabel}
              </p>
            )}
            {/* TODAY */}
            <div className="home-metric-card">
              <div className="home-metric-header">
                <span className="home-metric-title">
                  TODAY · {dayLabel}
                  <WidgetHelpButton label="TODAY" open={todayHelpOpen} onToggle={() => setTodayHelpOpen((v) => !v)} />
                </span>
                {!isStaleDay && (
                  <Link to="/history" className="home-metric-link">
                    {displayTodayStats.count} {displayTodayStats.count === 1 ? "entry" : "entries"} →
                  </Link>
                )}
              </div>
              {todayHelpOpen && <p className="section-help-popover">{TODAY_HELP_TEXT}</p>}
              {isStaleDay ? (
                <MetricRefreshing />
              ) : displayTodayStats.count === 0 ? (
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
                <span className="home-metric-title">
                  {monthName} TOTAL
                  <WidgetHelpButton label={`${monthName} TOTAL`} open={mtdHelpOpen} onToggle={() => setMtdHelpOpen((v) => !v)} />
                </span>
                <span className="home-month-nav" aria-label="Month navigation">
                  <button
                    type="button"
                    className="home-month-nav-button"
                    aria-label="Previous month"
                    title="Previous month"
                    onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))}
                  >
                    <ChevronLeft size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="home-month-nav-button"
                    aria-label="Next month"
                    title="Next month"
                    disabled={selectedMonth === currentMonth}
                    onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))}
                  >
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </span>
                {!isStaleMonth && selectedMonth === currentMonth && (
                  <Link to="/history" className="home-metric-link">
                    {displayMtdStats.count} {displayMtdStats.count === 1 ? "entry" : "entries"} →
                  </Link>
                )}
              </div>
              {mtdHelpOpen && <p className="section-help-popover">{MTD_HELP_TEXT}</p>}
              {isStaleMonth || isSelectedMonthLoading || (dataset.status !== "ready" && !cachedEntry) ? (
                <MetricRefreshing />
              ) : displaySelectedMtdStats.count === 0 ? (
                <p className="home-metric-empty">No expense entries</p>
              ) : (
                <>
                  <p className="home-metric-amount"><FormattedAmount prefix="$" value={displaySelectedMtdStats.usdTotal} /></p>
                  {displaySelectedMtdStats.deviation && <DeviationLine deviation={displaySelectedMtdStats.deviation} />}
                  <MtdSpendChart
                    dailyAmounts={selectedMonth === currentMonth ? displayMtdDailyAmounts : selectedMtdDailyAmounts}
                    weekBoundaryPositions={selectedMonth === currentMonth ? displayWeekBoundaryPositions : getMtdWeekBoundaryPositions(year, month)}
                    year={year}
                    month={month}
                  />
                  <button
                    type="button"
                    className="month-details-toggle"
                    aria-expanded={monthDetailsOpen}
                    onClick={() => setMonthDetailsOpen((v) => !v)}
                  >
                    Month details {monthDetailsOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                  </button>
                </>
              )}
              {monthDetailsOpen && (
                <MonthDetailsPanel
                  records={records}
                  toIso={toIso}
                  startDate={selectedMonthRange.startDate}
                  endDate={selectedMonthRange.endDate}
                  isLoading={dataset.status !== "ready" || isSelectedMonthLoading}
                />
              )}
            </div>

            {/* YEARLY VIEW (merged YTD + full-year forecast) */}
            <div className="home-metric-card">
              <div className="home-metric-header">
                <span className="home-metric-title">
                  YEARLY VIEW
                  <WidgetHelpButton label="YEARLY VIEW" open={ytdHelpOpen} onToggle={() => setYtdHelpOpen((v) => !v)} />
                </span>
              </div>
              {ytdHelpOpen && <p className="section-help-popover">{YTD_HELP_TEXT}</p>}
              <div className="home-yearly-columns">
                <div className="home-yearly-col">
                  <p className="home-yearly-label">{year} SO FAR</p>
                  {displayYtdStats.count === 0 ? (
                    <p className="home-metric-empty">No expense entries</p>
                  ) : (
                    <>
                      <p className="home-metric-amount"><FormattedAmount prefix="$" value={displayYtdStats.usdTotal} /></p>
                      {displayYtdStats.deviation && <DeviationLine deviation={displayYtdStats.deviation} />}
                    </>
                  )}
                </div>
                <div className="home-yearly-col">
                  <p className="home-yearly-label">Full year FORECAST</p>
                  {displayYtdForecast.amountUsd === null ? (
                    <p className="home-metric-empty">Not enough data</p>
                  ) : (
                    <>
                      <p className="home-metric-amount">
                        <FormattedAmount prefix="$" value={displayYtdForecast.amountUsd} />
                      </p>
                      {displayYtdForecast.deviation ? (
                        <DeviationLine deviation={displayYtdForecast.deviation} />
                      ) : (
                        <p className="home-metric-forecast">No data</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ROLLING 12M */}
            <div className="home-metric-card">
              <div className="home-metric-header">
                <span className="home-metric-title">
                  ROLLING 12M EXPENSES
                  <WidgetHelpButton
                    label="ROLLING 12M EXPENSES"
                    open={rolling12mHelpOpen}
                    onToggle={() => setRolling12mHelpOpen((v) => !v)}
                  />
                </span>
              </div>
              {rolling12mHelpOpen && <p className="section-help-popover">{ROLLING_12M_HELP_TEXT}</p>}
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

