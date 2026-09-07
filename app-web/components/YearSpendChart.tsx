import { useRef, useEffect } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { BarSeriesOption } from "echarts/charts";
import type { GridComponentOption, TooltipComponentOption, MarkLineComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

type YearChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | MarkLineComponentOption
>;

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface YearSpendChartProps {
  monthlyAmounts: (number | null)[];
  year: number;
  averagePerMonth: number;
  currentMonthIndex: number | null;
  /** Fires on desktop click, or on a second touch tap of the same bar (first tap only shows its tooltip). */
  onMonthClick?: (year: number, month: number) => void;
}

export type MonthClickResolution = { type: "ignore" } | { type: "arm" } | { type: "navigate" };

/**
 * Decides what a bar click means: ignore clicks on non-primary series or null (forecast-only) months,
 * arm the tooltip on a touch device's first tap of a bar, or navigate on a second same-bar tap / any mouse click.
 */
export function resolveMonthClick(
  seriesIndex: number,
  dataIndex: number,
  monthlyAmounts: (number | null)[],
  isTouch: boolean,
  armedIndex: number | null,
): MonthClickResolution {
  if (seriesIndex !== 0 || monthlyAmounts[dataIndex] === null) return { type: "ignore" };
  if (isTouch && armedIndex !== dataIndex) return { type: "arm" };
  return { type: "navigate" };
}

/** Real months render as solid bars; forecast (future) months render as flat, non-interactive gray placeholders. */
export function buildSeries(
  monthlyAmounts: (number | null)[],
  forecastHatchColor: string,
  averagePerMonth: number,
  averageLineColor: string,
  currentMonthIndex: number | null,
): BarSeriesOption[] {
  const actualAmounts = monthlyAmounts.filter((a): a is number => a !== null);
  const hasForecast = actualAmounts.length < monthlyAmounts.length;
  const forecastFillStyle = {
    color: "rgba(107,114,128,0.15)",
    decal: {
      symbol: "line",
      rotation: Math.PI / 4,
      dashArrayX: [1, 0],
      dashArrayY: [2, 6],
      color: forecastHatchColor,
      maxTileWidth: 12,
      maxTileHeight: 12,
    },
  };
  const actualSeries: BarSeriesOption = {
    type: "bar",
    data: monthlyAmounts.map((amount, index) =>
      // In-progress current month keeps its blue border but borrows the future months' fill, to signal it's incomplete.
      index === currentMonthIndex
        ? { value: amount ?? 0, itemStyle: { ...forecastFillStyle, borderColor: "rgba(79,70,229,0.9)", borderWidth: 2 } }
        : amount ?? 0,
    ),
    barMaxWidth: 24,
    itemStyle: { color: "rgba(79,70,229,0.9)" },
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: averageLineColor, type: "dashed" },
      label: { show: false },
      data: [{ yAxis: averagePerMonth }],
    },
  };
  if (!hasForecast) return [actualSeries];

  const placeholderHeight = (Math.max(0, ...actualAmounts) || 1) * 0.3;
  const forecastSeries: BarSeriesOption = {
    type: "bar",
    data: monthlyAmounts.map((amount) => (amount === null ? placeholderHeight : 0)),
    barMaxWidth: 24,
    barGap: "-100%",
    itemStyle: forecastFillStyle,
    tooltip: { show: false },
    silent: true,
  };
  return [actualSeries, forecastSeries];
}

export function YearSpendChart({ monthlyAmounts, year, averagePerMonth, currentMonthIndex, onMonthClick }: YearSpendChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Touch-only: dataIndex of the bar whose tooltip is already showing from a first tap.
  const armedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    armedIndexRef.current = null;
  }, [monthlyAmounts, year]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.createElement("canvas").getContext("2d")) return;

    const cssVars = getComputedStyle(document.documentElement);
    const forecastHatchColor =
      cssVars.getPropertyValue("--color-chart-forecast-hatch").trim() || "rgba(107,114,128,0.3)";
    const averageLineColor =
      cssVars.getPropertyValue("--color-chart-average-line").trim() || "#FB923C";

    const config: YearChartOption = {
      animation: false,
      grid: { top: 8, right: 8, bottom: 24, left: 8, containLabel: false },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const item = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
          const amount = monthlyAmounts[item.dataIndex];
          if (amount === null) return "";
          return `${MONTH_NAMES[item.dataIndex]} ${year}<br/>Total: $${amount.toFixed(2)}`;
        },
      },
      xAxis: {
        type: "category",
        data: MONTH_INITIALS,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "var(--color-text-placeholder)" },
        splitLine: { show: false },
      },
      yAxis: { type: "value", show: false, min: 0 },
      series: buildSeries(monthlyAmounts, forecastHatchColor, averagePerMonth, averageLineColor, currentMonthIndex),
    };

    chartRef.current?.dispose();
    const chart = echarts.init(container);
    chart.setOption(config);
    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    const handleClick = (params: unknown): void => {
      if (!onMonthClick) return;
      const { seriesIndex, dataIndex, event } = params as {
        seriesIndex: number;
        dataIndex: number;
        event?: { event?: PointerEvent };
      };
      const isTouch = event?.event?.pointerType === "touch";
      const resolution = resolveMonthClick(seriesIndex, dataIndex, monthlyAmounts, isTouch, armedIndexRef.current);

      if (resolution.type === "ignore") return;
      if (resolution.type === "arm") {
        chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex });
        armedIndexRef.current = dataIndex;
        return;
      }

      armedIndexRef.current = null;
      onMonthClick(year, dataIndex + 1);
    };
    chart.on("click", handleClick);

    return () => {
      chart.off("click", handleClick);
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [monthlyAmounts, year, averagePerMonth, currentMonthIndex, onMonthClick]);


  return (
    <div className="home-chart-container year-chart-container" ref={containerRef} role="img" aria-label="Monthly spending for the selected year">
    </div>
  );
}
