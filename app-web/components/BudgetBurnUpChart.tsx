import { useRef, useEffect } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { LineSeriesOption } from "echarts/charts";
import type { GridComponentOption, TooltipComponentOption, MarkLineComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";
import type { BudgetTimelinePoint } from "../utils/budgetTimeline";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

type BudgetChartOption = ComposeOption<
  LineSeriesOption | GridComponentOption | TooltipComponentOption | MarkLineComponentOption
>;

interface BudgetBurnUpChartProps {
  points: BudgetTimelinePoint[];
  granularity: "day" | "week";
  todayIso: string;
  endDate: string | null;
  budgetUsd: number | null;
}

type MarkLineData = NonNullable<MarkLineComponentOption["data"]>[number];

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function indexOnOrAfter(points: BudgetTimelinePoint[], iso: string): number {
  return points.findIndex((point) => point.date >= iso);
}

export function BudgetBurnUpChart({ points, granularity, todayIso, endDate, budgetUsd }: BudgetBurnUpChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.createElement("canvas").getContext("2d")) return;

    const cssVars = getComputedStyle(document.documentElement);
    const forecastBorderColor =
      cssVars.getPropertyValue("--color-chart-forecast-border").trim() || "rgba(107,114,128,0.7)";
    const errorColor = cssVars.getPropertyValue("--color-error").trim() || "#EF4444";
    const markerColor = cssVars.getPropertyValue("--color-text-placeholder").trim() || "#9CA3AF";

    const lastActual = points.reduce((max, point) => Math.max(max, point.actualCum ?? 0), 0);
    const isOverBudget = budgetUsd !== null && lastActual > budgetUsd;

    const markLines: MarkLineData[] = [];
    if (budgetUsd !== null) {
      markLines.push({
        yAxis: budgetUsd,
        lineStyle: { color: isOverBudget ? errorColor : markerColor, type: "solid" },
        label: { show: true, position: "insideStartTop", formatter: `Budget ${formatUsd(budgetUsd)}`, color: isOverBudget ? errorColor : markerColor },
      });
    }
    const todayIndex = indexOnOrAfter(points, todayIso);
    if (todayIndex >= 0) {
      markLines.push({ xAxis: todayIndex, label: { show: true, formatter: "Today", color: markerColor } });
    }
    const endIndex = endDate ? indexOnOrAfter(points, endDate) : -1;
    if (endIndex >= 0 && endIndex !== todayIndex) {
      markLines.push({ xAxis: endIndex, label: { show: true, formatter: "Ends", color: markerColor } });
    }

    const periodLabel = granularity === "week" ? "Week" : "Daily";
    const hasOverall = points.some((point) => point.projectedOverall !== null);
    const hasRecent = points.some((point) => point.projectedRecent !== null);
    const hasBand = hasOverall && hasRecent;
    const compactUsd = new Intl.NumberFormat(undefined, {
      style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
    });
    const projectedSeries = hasBand
      ? [
          {
            type: "line" as const,
            data: points.map((point) => point.projectedOverall === null || point.projectedRecent === null
              ? null : Math.min(point.projectedOverall, point.projectedRecent)),
            stack: "forecast-band",
            showSymbol: false,
            lineStyle: { opacity: 0 },
            areaStyle: { color: "rgba(107,114,128,0)" },
            tooltip: { show: false },
          },
          {
            type: "line" as const,
            data: points.map((point) => point.projectedOverall === null || point.projectedRecent === null
              ? null : Math.abs(point.projectedOverall - point.projectedRecent)),
            stack: "forecast-band",
            showSymbol: false,
            lineStyle: { opacity: 0 },
            areaStyle: { color: "rgba(107,114,128,0.12)" },
            tooltip: { show: false },
          },
          ...(["projectedOverall", "projectedRecent"] as const).map((key) => ({
            type: "line" as const,
            data: points.map((point) => point[key]),
            smooth: false,
            showSymbol: false,
            connectNulls: false,
            lineStyle: { color: forecastBorderColor, type: "dashed" as const, width: 1.5 },
            tooltip: { show: false },
          })),
        ]
      : hasOverall || hasRecent
        ? [{
            type: "line" as const,
            data: points.map((point) => point.projectedOverall ?? point.projectedRecent),
            smooth: false,
            showSymbol: false,
            connectNulls: false,
            lineStyle: { color: forecastBorderColor, type: "dashed" as const, width: 1.5 },
            tooltip: { show: false },
          }]
        : [];

    const config: BudgetChartOption = {
      animation: false,
      grid: { top: 24, right: 12, bottom: 28, left: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const item = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
          const point = points[item.dataIndex];
          if (!point) return "";
          const heading = granularity === "week" ? `Week ending ${formatShortDate(point.date)}` : formatShortDate(point.date);
          if (point.actualCum === null) {
            if (point.projectedOverall !== null && point.projectedRecent !== null) {
              return `${heading}<br/>Recent pace: ${formatUsd(point.projectedRecent)}<br/>Overall pace: ${formatUsd(point.projectedOverall)}`;
            }
            const projected = point.projectedOverall ?? point.projectedRecent;
            return projected === null ? "" : `${heading}<br/>Projected: ${formatUsd(projected)}`;
          }
          return `${heading}<br/>${periodLabel}: ${formatUsd(point.periodUsd ?? 0)}<br/>Total: ${formatUsd(point.actualCum)}`;
        },
      },
      xAxis: {
        type: "category",
        data: points.map((point) => point.date),
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: markerColor, interval: "auto", hideOverlap: true, formatter: formatShortDate },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        show: true,
        min: 0,
        max: (extent: { max: number }) => Math.max(extent.max, (budgetUsd ?? 0) * 1.05),
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: markerColor, formatter: (value: number) => compactUsd.format(value) },
        splitLine: { show: true, lineStyle: { color: cssVars.getPropertyValue("--color-border").trim() || "#E5E7EB" } },
      },
      series: [
        {
          type: "line",
          data: points.map((point) => point.actualCum),
          smooth: false,
          connectNulls: false,
          showSymbol: points.length <= 60,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: "rgba(79,70,229,0.9)", width: 2 },
          itemStyle: { color: "rgba(79,70,229,0.9)" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(79,70,229,0.30)" },
              { offset: 1, color: "rgba(79,70,229,0.00)" },
            ]),
          },
          markLine: { silent: true, symbol: "none", lineStyle: { color: markerColor, type: "dashed" }, data: markLines },
        },
        ...projectedSeries,
      ],
    };

    const chart = echarts.init(container);
    chart.setOption(config);
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [points, granularity, todayIso, endDate, budgetUsd]);

  return (
    <div className="budget-chart-container" ref={containerRef} role="img" aria-label="Cumulative spending timeline" />
  );
}
