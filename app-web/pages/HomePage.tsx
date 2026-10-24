import { AppActivityTracker } from "../components/AppActivityTracker";
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FileSpreadsheet, Receipt } from "lucide-react";
import { HomeDashboard } from "../components/HomeDashboard";
import { Layout } from "../components/Layout";
import { MonthDetailsPanel } from "../components/MonthDetailsPanel";
import { YearDetailsPanel } from "../components/YearDetailsPanel";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";
import { useDataset } from "../contexts/DatasetContext";
import { getTodayLocalDate, readDateDisplayFormat } from "../utils/date";
import {
  buildIsoNormalizer,
  getTodayStats,
  getMtdStats,
  getMonthRange,
  getMonthStats,
  getYtdStats,
  getYtdForecast,
  getYearStats,
  getRolling12mStats,
  getMtdDailyAmounts,
  shiftMonth,
  type IsoNormalizer,
  type PeriodStats,
} from "../utils/dashboardStats";
import type { ExpenseRecord } from "../types/expense";
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

type HomeView = "config-loading" | "no-sheet" | "no-data" | "dataset-loading" | "error" | "dashboard" | "blank";

function getHomeView(
  isConfigLoading: boolean,
  hasConfig: boolean,
  status: ReturnType<typeof useDataset>["status"],
  hasCache: boolean,
  recordCount: number,
): HomeView {
  if (isConfigLoading) return "config-loading";
  if (!hasConfig) return "no-sheet";
  if (!hasCache && status === "ready" && recordCount === 0) return "no-data";
  if (!hasCache && (status === "idle" || status === "loading")) return "dataset-loading";
  if (status === "error") return "error";
  if (hasCache || (status === "ready" && recordCount > 0)) return "dashboard";
  return "blank";
}

function HomeContent({ view, onRetry, children }: {
  view: HomeView;
  onRetry: () => void;
  children: ReactNode;
}): JSX.Element | null {
  switch (view) {
    case "config-loading":
      return <div className="skeleton-list"><MetricCardSkeleton /><MetricCardSkeleton /><MetricCardSkeleton /></div>;
    case "no-sheet":
      return <HomeEmptyState variant="no-sheet" />;
    case "no-data":
      return <HomeEmptyState variant="no-data" />;
    case "dataset-loading":
      return (
        <div className="skeleton-list">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <div className="home-metric-row"><MetricCardSkeleton /><MetricCardSkeleton /></div>
          <p className="home-loading-hint">Loading expenses from Google Sheet…</p>
        </div>
      );
    case "error":
      return (
        <div className="home-dataset-error">
          <p>Failed to load expense data.</p>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>Retry</button>
        </div>
      );
    case "dashboard":
      return <>{children}</>;
    default:
      return null;
  }
}

function getEarliestLoadedMonth(records: ExpenseRecord[], toIso: IsoNormalizer): string | null {
  return records.reduce<string | null>((earliest, record) => {
    const iso = toIso(record.Date);
    const recordMonth = iso?.slice(0, 7) ?? null;
    return recordMonth && (!earliest || recordMonth < earliest) ? recordMonth : earliest;
  }, null);
}

function getYearLoadingState(
  status: ReturnType<typeof useDataset>["status"],
  isLoadingHistory: boolean,
  earliestLoadedMonth: string | null,
  selectedYear: number,
  currentYear: number,
) {
  const earliestLoadedYear = earliestLoadedMonth ? Number(earliestLoadedMonth.slice(0, 4)) : null;
  const isSelectedYearLoading =
    (selectedYear !== currentYear && status !== "ready") ||
    (isLoadingHistory && (earliestLoadedYear === null || selectedYear < earliestLoadedYear));
  const isYearNavLocked = isSelectedYearLoading || isLoadingHistory;
  const isPriorYearLoading =
    isSelectedYearLoading ||
    (isLoadingHistory && (earliestLoadedYear === null || selectedYear - 1 < earliestLoadedYear));
  return {
    isSelectedYearLoading,
    isYearDetailsLoading: status !== "ready" || isPriorYearLoading,
    previousDisabled: isYearNavLocked || (earliestLoadedYear !== null && selectedYear <= earliestLoadedYear),
    nextDisabled: isYearNavLocked || selectedYear === currentYear,
  };
}

type LiveMetrics = Pick<MetricsCacheEntry,
  "todayStats" | "mtdStats" | "ytdStats" | "ytdForecast" | "rolling12mStats" | "mtdDailyAmounts">;

function getDisplayedMetrics({ cache, live, monthStats, yearStats, dailyAmounts, isCurrentMonth, isCurrentYear, today }: {
  cache: MetricsCacheEntry | null;
  live: LiveMetrics;
  monthStats: PeriodStats;
  yearStats: PeriodStats;
  dailyAmounts: (number | null)[];
  isCurrentMonth: boolean;
  isCurrentYear: boolean;
  today: string;
}) {
  const displayMtdStats = cache?.mtdStats ?? live.mtdStats;
  const displayYtdStats = cache?.ytdStats ?? live.ytdStats;
  const isStaleDay = cache !== null && cache.cacheDate !== today;
  return {
    isStaleDay,
    isStaleMonth: cache !== null && cache.cacheDate.slice(0, 7) !== today.slice(0, 7),
    cacheDateLabel: isStaleDay ? formatShortDate(cache.cacheDate) : null,
    displayTodayStats: cache?.todayStats ?? live.todayStats,
    displayMtdStats,
    displaySelectedMtdStats: isCurrentMonth ? displayMtdStats : monthStats,
    displaySelectedYearStats: isCurrentYear ? displayYtdStats : yearStats,
    displayYtdForecast: cache?.ytdForecast ?? live.ytdForecast,
    displayRolling12mStats: cache?.rolling12mStats ?? live.rolling12mStats,
    displayMtdDailyAmounts: isCurrentMonth ? (cache?.mtdDailyAmounts ?? live.mtdDailyAmounts) : dailyAmounts,
  };
}

export function HomePage(): JSX.Element {
  const { config, isConfigLoading } = useConfig();
  const { session } = useAuth();
  const dataset = useDataset();
  const location = useLocation();
  const navigate = useNavigate();
  const today = useMemo(() => getTodayLocalDate(), []);
  const dateDisplayFormat = useMemo(() => readDateDisplayFormat(localStorage), []);
  const currentMonth = today.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const currentYear = Number(today.slice(0, 4));
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [cachedEntry, setCachedEntry] = useState<MetricsCacheEntry | null>(null);
  const driveModifiedTimeRef = useRef<string | null>(null);
  const mtdCardRef = useRef<HTMLDivElement>(null);

  const [todayHelpOpen, setTodayHelpOpen] = useState(false);
  const [mtdHelpOpen, setMtdHelpOpen] = useState(false);
  const [ytdHelpOpen, setYtdHelpOpen] = useState(false);
  const [rolling12mHelpOpen, setRolling12mHelpOpen] = useState(false);
  const [monthDetailsOpen, setMonthDetailsOpen] = useState(false);
  const [yearDetailsOpen, setYearDetailsOpen] = useState(false);

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
    if (yearDetailsOpen && dataset.status !== "ready") {
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
    }
  }, [yearDetailsOpen, dataset.status, dataset.loadDataset]);

  useEffect(() => {
    const isViewingPastPeriod = selectedMonth !== currentMonth || selectedYear !== currentYear;
    if (isViewingPastPeriod && dataset.status === "idle") {
      dataset.loadDataset().catch(() => {/* error surfaced via dataset.error */});
    }
  }, [selectedMonth, currentMonth, selectedYear, currentYear, dataset.status, dataset.loadDataset]);

  const records = dataset.snapshot?.records ?? [];

  const toIso = useMemo(() => buildIsoNormalizer(records), [records]);

  const todayStats = useMemo(() => getTodayStats(records, today, toIso), [records, today, toIso]);
  const mtdStats = useMemo(() => getMtdStats(records, today, toIso), [records, today, toIso]);
  const selectedMonthStats = useMemo(() => getMonthStats(records, selectedMonth, toIso), [records, selectedMonth, toIso]);
  const ytdStats = useMemo(() => getYtdStats(records, today, toIso), [records, today, toIso]);
  const selectedYearStats = useMemo(() => getYearStats(records, selectedYear, toIso), [records, selectedYear, toIso]);
  const ytdForecast = useMemo(() => getYtdForecast(records, today, toIso), [records, today, toIso]);
  const rolling12mStats = useMemo(() => getRolling12mStats(records, today, toIso), [records, today, toIso]);
  const currentMtdDailyAmounts = useMemo(() => getMtdDailyAmounts(records, currentMonth, toIso, today), [records, currentMonth, toIso, today]);
  const selectedMtdDailyAmounts = useMemo(() => getMtdDailyAmounts(records, selectedMonth, toIso, today), [records, selectedMonth, toIso, today]);

  const [year, month] = selectedMonth.split("-").map(Number);

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
    });
    driveModifiedTimeRef.current = null;
  }, [dataset.status, todayStats, mtdStats, ytdStats, ytdForecast, rolling12mStats]);

  const monthName = new Date(year, month - 1, 1).toLocaleString("en", { month: "long" }).toUpperCase();
  const mtdTitle = `${monthName} ${selectedMonth === currentMonth ? "SO FAR" : "TOTAL"}`;
  const dayLabel = formatShortDate(today);
  const selectedMonthRange = getMonthRange(selectedMonth);

  // Year Details bar drill-down: jump MTD to that month, expand its details, scroll it into view.
  const handleYearMonthClick = (clickedYear: number, clickedMonth: number): void => {
    setSelectedMonth(`${clickedYear}-${String(clickedMonth).padStart(2, "0")}`);
    setMonthDetailsOpen(true);
    mtdCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const view = getHomeView(isConfigLoading, !!config, dataset.status, cachedEntry !== null, records.length);
  const earliestLoadedMonth = getEarliestLoadedMonth(records, toIso);
  const isSelectedMonthLoading =
    (selectedMonth !== currentMonth && dataset.status !== "ready") ||
    (dataset.isLoadingHistory && (!earliestLoadedMonth || selectedMonth < earliestLoadedMonth));
  const yearLoading = getYearLoadingState(dataset.status, dataset.isLoadingHistory, earliestLoadedMonth, selectedYear, currentYear);
  const {
    isStaleDay, isStaleMonth, cacheDateLabel, displayTodayStats, displayMtdStats,
    displaySelectedMtdStats, displaySelectedYearStats, displayYtdForecast, displayRolling12mStats, displayMtdDailyAmounts,
  } = getDisplayedMetrics({
    cache: cachedEntry,
    live: { todayStats, mtdStats, ytdStats, ytdForecast, rolling12mStats, mtdDailyAmounts: currentMtdDailyAmounts },
    monthStats: selectedMonthStats, yearStats: selectedYearStats, dailyAmounts: selectedMtdDailyAmounts,
    isCurrentMonth: selectedMonth === currentMonth, isCurrentYear: selectedYear === currentYear, today,
  });

  return (
    <Layout title="Quick Expense">
      <AppActivityTracker />
      {showSavedBanner ? (
        <StatusBanner variant="success" message="Expense saved successfully." />
      ) : null}
      <div className="home-wrapper">
        <HomeContent view={view} onRetry={() => { dataset.reloadDataset().catch(() => {}); }}>
          <HomeDashboard
            stale={isStaleDay}
            cacheDateLabel={cacheDateLabel}
            today={{
              dayLabel, stats: displayTodayStats, stale: isStaleDay,
              help: { label: "TODAY", open: todayHelpOpen, onToggle: () => setTodayHelpOpen((value) => !value) },
            }}
            month={{
              title: mtdTitle, cardRef: mtdCardRef, isCurrent: selectedMonth === currentMonth,
              stale: isStaleMonth,
              refreshing: isStaleMonth || isSelectedMonthLoading || (dataset.status !== "ready" && !cachedEntry),
              entryCount: displayMtdStats.count, stats: displaySelectedMtdStats,
              dailyAmounts: displayMtdDailyAmounts,
              year, month,
              help: { label: mtdTitle, open: mtdHelpOpen, onToggle: () => setMtdHelpOpen((value) => !value) },
              onPrevious: () => setSelectedMonth((value) => shiftMonth(value, -1)),
              onNext: () => setSelectedMonth((value) => shiftMonth(value, 1)),
              detailsOpen: monthDetailsOpen,
              onToggleDetails: () => setMonthDetailsOpen((value) => !value),
              details: monthDetailsOpen && <MonthDetailsPanel
                records={records} toIso={toIso} startDate={selectedMonthRange.startDate}
                endDate={selectedMonthRange.endDate} isLoading={dataset.status !== "ready" || isSelectedMonthLoading}
                dateDisplayFormat={dateDisplayFormat} />,
            }}
            year={{
              year: selectedYear, isCurrent: selectedYear === currentYear, refreshing: yearLoading.isSelectedYearLoading,
              previousDisabled: yearLoading.previousDisabled,
              nextDisabled: yearLoading.nextDisabled,
              onPrevious: () => setSelectedYear((value) => value - 1),
              onNext: () => setSelectedYear((value) => value + 1),
              stats: displaySelectedYearStats, forecast: displayYtdForecast,
              help: { label: "YEARLY VIEW", open: ytdHelpOpen, onToggle: () => setYtdHelpOpen((value) => !value) },
              detailsOpen: yearDetailsOpen,
              onToggleDetails: () => setYearDetailsOpen((value) => !value),
              details: yearDetailsOpen && <YearDetailsPanel records={records} toIso={toIso}
                year={selectedYear} today={today} isLoading={yearLoading.isYearDetailsLoading} onMonthClick={handleYearMonthClick} />,
            }}
            rolling={{
              stats: displayRolling12mStats,
              help: { label: "ROLLING 12M EXPENSES", open: rolling12mHelpOpen, onToggle: () => setRolling12mHelpOpen((value) => !value) },
            }}
          />
        </HomeContent>

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

