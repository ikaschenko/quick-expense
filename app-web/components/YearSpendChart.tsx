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
}

/** Real months render as solid bars; forecast (future) months render as flat, non-interactive gray placeholders. */
function buildSeries(
  monthlyAmounts: (number | null)[],
  forecastHatchColor: string,
  averagePerMonth: number,
  averageLineColor: string,
): BarSeriesOption[] {
  const actualAmounts = monthlyAmounts.filter((a): a is number => a !== null);
  const hasForecast = actualAmounts.length < monthlyAmounts.length;
  const actualSeries: BarSeriesOption = {
    type: "bar",
    data: monthlyAmounts.map((amount) => amount ?? 0),
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
    itemStyle: {
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
    },
    tooltip: { show: false },
    silent: true,
  };
  return [actualSeries, forecastSeries];
}

export function YearSpendChart({ monthlyAmounts, year, averagePerMonth }: YearSpendChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

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
      series: buildSeries(monthlyAmounts, forecastHatchColor, averagePerMonth, averageLineColor),
    };

    chartRef.current?.dispose();
    const chart = echarts.init(container);
    chart.setOption(config);
    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [monthlyAmounts, year, averagePerMonth]);

  return (
    <div className="home-chart-container year-chart-container" ref={containerRef} role="img" aria-label="Monthly spending for the selected year">
    </div>
  );
}
