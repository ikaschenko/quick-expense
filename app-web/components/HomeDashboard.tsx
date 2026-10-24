import { useState, type JSX, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, Loader2 } from "lucide-react";
import { FormattedAmount } from "./FormattedAmount";
import { MtdSpendChart } from "./MtdSpendChart";
import { formatPctChange, type PeriodStats, type TodayStats, type YtdForecast } from "../utils/dashboardStats";

const TODAY_HELP_TEXT = "Total amount of expenses for today.";
const MTD_HELP_TEXT =
  "Total amount of expenses for the ongoing month, compared to the same date range for the previous month (shown only when comparable prior-month data exists).";
const YTD_HELP_TEXT =
  "Total amount of expenses for the ongoing year, compared to the same date range for the previous year (if enough data). The forecast projects your full-year total from your recent daily spending rate. Use the arrows to review a past year — it then shows that year's full total, and the forecast does not apply.";
const ROLLING_12M_HELP_TEXT =
  "Total amount of expenses over the trailing 12 months (up to yesterday), compared to the preceding 12-month period (shown when that data exists).";

interface HelpProps {
  label: string;
  open: boolean;
  onToggle: () => void;
}

function WidgetHelpButton({ label, open, onToggle }: HelpProps): JSX.Element {
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

function MetricRefreshing(): JSX.Element {
  return (
    <p className="home-metric-refreshing" role="status">
      <Loader2 size={14} className="icon-spin" aria-hidden />
      Updating…
    </p>
  );
}

function DeviationLine({ deviation }: { deviation: NonNullable<PeriodStats["deviation"]> }): JSX.Element {
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
          onClick={() => setShowTooltip((value) => !value)}
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

function EntryCountLink({ count }: { count: number }): JSX.Element {
  return (
    <Link to="/history" className="home-metric-link">
      {count} {count === 1 ? "entry" : "entries"} →
    </Link>
  );
}

function PeriodAmount({ stats, refreshing }: { stats: PeriodStats; refreshing: boolean }): JSX.Element {
  if (refreshing) return <MetricRefreshing />;
  if (stats.count === 0) return <p className="home-metric-empty">No expense entries</p>;
  return (
    <>
      <p className="home-metric-amount"><FormattedAmount prefix="$" value={stats.usdTotal} /></p>
      {stats.deviation && <DeviationLine deviation={stats.deviation} />}
    </>
  );
}

interface TodayCardProps {
  dayLabel: string;
  stats: TodayStats;
  stale: boolean;
  help: HelpProps;
}

function TodayAmount({ stats, stale }: Pick<TodayCardProps, "stats" | "stale">): JSX.Element {
  if (stale) return <MetricRefreshing />;
  if (stats.count === 0) return <p className="home-metric-empty">No expense entries</p>;
  return (
    <p className="home-metric-amount">
      {stats.dualCurrency ? (
        <>
          <FormattedAmount prefix={`${stats.dualCurrency.code} `} value={stats.dualCurrency.amount} />
          {" / "}
          <FormattedAmount prefix="$" value={stats.usdTotal} />
        </>
      ) : <FormattedAmount prefix="$" value={stats.usdTotal} />}
    </p>
  );
}

function TodayMetricCard({ dayLabel, stats, stale, help }: TodayCardProps): JSX.Element {
  return (
    <div className="home-metric-card">
      <div className="home-metric-header">
        <span className="home-metric-title">
          TODAY · {dayLabel}
          <WidgetHelpButton {...help} />
        </span>
        {!stale && <EntryCountLink count={stats.count} />}
      </div>
      {help.open && <p className="section-help-popover">{TODAY_HELP_TEXT}</p>}
      <TodayAmount stats={stats} stale={stale} />
    </div>
  );
}

interface MonthCardProps {
  title: string;
  help: HelpProps;
  cardRef: RefObject<HTMLDivElement | null>;
  isCurrent: boolean;
  stale: boolean;
  refreshing: boolean;
  entryCount: number;
  stats: PeriodStats;
  dailyAmounts: (number | null)[];
  year: number;
  month: number;
  onPrevious: () => void;
  onNext: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  details: ReactNode;
}

function MonthBody(props: MonthCardProps): JSX.Element {
  if (props.refreshing) return <MetricRefreshing />;
  if (props.stats.count === 0) return <p className="home-metric-empty">No expense entries</p>;
  return (
    <>
      <PeriodAmount stats={props.stats} refreshing={false} />
      <MtdSpendChart dailyAmounts={props.dailyAmounts} year={props.year} month={props.month} />
      <button
        type="button"
        className="month-details-toggle"
        aria-expanded={props.detailsOpen}
        onClick={props.onToggleDetails}
      >
        Month details {props.detailsOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
    </>
  );
}

function MonthMetricCard(props: MonthCardProps): JSX.Element {
  return (
    <div className="home-metric-card" ref={props.cardRef}>
      <div className="home-metric-header">
        <span className="home-metric-title">
          {props.title}
          <WidgetHelpButton {...props.help} />
        </span>
        <span className="home-month-nav" aria-label="Month navigation">
          <button
            type="button"
            className="home-month-nav-button"
            aria-label="Previous month"
            title="Previous month"
            onClick={props.onPrevious}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="home-month-nav-button"
            aria-label="Next month"
            title="Next month"
            disabled={props.isCurrent}
            onClick={props.onNext}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </span>
        {!props.stale && props.isCurrent && <EntryCountLink count={props.entryCount} />}
      </div>
      {props.help.open && <p className="section-help-popover">{MTD_HELP_TEXT}</p>}
      <MonthBody {...props} />
      {props.details}
    </div>
  );
}

interface YearCardProps {
  help: HelpProps;
  year: number;
  isCurrent: boolean;
  refreshing: boolean;
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  stats: PeriodStats;
  forecast: YtdForecast;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  details: ReactNode;
}

function YearForecast({ refreshing, isCurrent, forecast }: Pick<YearCardProps, "refreshing" | "isCurrent" | "forecast">): JSX.Element {
  if (refreshing) return <MetricRefreshing />;
  if (!isCurrent) return <p className="home-metric-forecast">Not applicable for past years</p>;
  if (forecast.amountUsd === null) return <p className="home-metric-empty">Not enough data</p>;
  return (
    <>
      <p className="home-metric-amount"><FormattedAmount prefix="$" value={forecast.amountUsd} /></p>
      {forecast.deviation ? <DeviationLine deviation={forecast.deviation} /> : <p className="home-metric-forecast">No data</p>}
    </>
  );
}

function YearMetricCard(props: YearCardProps): JSX.Element {
  return (
    <div className="home-metric-card">
      <div className="home-metric-header">
        <span className="home-metric-title">
          YEARLY VIEW
          <WidgetHelpButton {...props.help} />
        </span>
        <span className="home-month-nav" aria-label="Year navigation">
          <button
            type="button"
            className="home-month-nav-button"
            aria-label="Previous year"
            title="Previous year"
            disabled={props.previousDisabled}
            onClick={props.onPrevious}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="home-month-nav-button"
            aria-label="Next year"
            title="Next year"
            disabled={props.nextDisabled}
            onClick={props.onNext}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </span>
      </div>
      {props.help.open && <p className="section-help-popover">{YTD_HELP_TEXT}</p>}
      <div className="home-yearly-columns">
        <div className="home-yearly-col">
          <p className="home-yearly-label">{props.year} {props.isCurrent ? "SO FAR" : "TOTAL"}</p>
          <PeriodAmount stats={props.stats} refreshing={props.refreshing} />
        </div>
        <div className="home-yearly-col">
          <p className="home-yearly-label">Full year FORECAST</p>
          <YearForecast refreshing={props.refreshing} isCurrent={props.isCurrent} forecast={props.forecast} />
        </div>
      </div>
      {(props.refreshing || props.stats.count > 0) && (
        <button
          type="button"
          className="month-details-toggle"
          aria-expanded={props.detailsOpen}
          onClick={props.onToggleDetails}
        >
          Year details {props.detailsOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
      )}
      {props.details}
    </div>
  );
}

interface RollingCardProps {
  help: HelpProps;
  stats: PeriodStats;
}

function Rolling12mMetricCard({ help, stats }: RollingCardProps): JSX.Element {
  return (
    <div className="home-metric-card">
      <div className="home-metric-header">
        <span className="home-metric-title">
          ROLLING 12M EXPENSES
          <WidgetHelpButton {...help} />
        </span>
      </div>
      {help.open && <p className="section-help-popover">{ROLLING_12M_HELP_TEXT}</p>}
      <PeriodAmount stats={stats} refreshing={false} />
    </div>
  );
}

interface HomeDashboardProps {
  stale: boolean;
  cacheDateLabel: string | null;
  today: TodayCardProps;
  month: MonthCardProps;
  year: YearCardProps;
  rolling: RollingCardProps;
}

export function HomeDashboard({ stale, cacheDateLabel, today, month, year, rolling }: HomeDashboardProps): JSX.Element {
  return (
    <div className={`home-dashboard${stale ? " home-dashboard--stale" : ""}`}>
      {stale && <p className="home-stale-hint" role="status">Updating… · as of {cacheDateLabel}</p>}
      <TodayMetricCard {...today} />
      <MonthMetricCard {...month} />
      <YearMetricCard {...year} />
      <Rolling12mMetricCard {...rolling} />
    </div>
  );
}