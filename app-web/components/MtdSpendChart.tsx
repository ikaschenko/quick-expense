import { useRef, useEffect } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { LineSeriesOption } from "echarts/charts";
import type { GridComponentOption, TooltipComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

type MtdChartOption = ComposeOption<LineSeriesOption | GridComponentOption | TooltipComponentOption>;

interface MtdSpendChartProps {
  dailyAmounts: (number | null)[];
  weekBoundaryPositions: number[];
  year: number;
  month: number;
}

export function MtdSpendChart({ dailyAmounts, weekBoundaryPositions, year, month }: MtdSpendChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.createElement("canvas").getContext("2d")) return;

    // Read forecast colours from CSS design tokens via :root (reliable inheritance path)
    const cssVars = getComputedStyle(document.documentElement);
    const forecastBorderColor =
      cssVars.getPropertyValue("--color-chart-forecast-border").trim() || "rgba(107,114,128,0.7)";
    const forecastHatchColor =
      cssVars.getPropertyValue("--color-chart-forecast-hatch").trim() || "rgba(107,114,128,0.3)";

    const totalDays = dailyAmounts.length;
    const labels = Array.from({ length: totalDays }, (_, i) => String(i + 1));

    // 0-based index of the last day with actual data (today), or -1 if none
    let todayIndex = -1;
    for (let i = totalDays - 1; i >= 0; i--) {
      if (dailyAmounts[i] !== null) { todayIndex = i; break; }
    }

    let running = 0;
    const cumulativeActual = dailyAmounts.map((v) => v === null ? null : (running += v));

    const cumulativeToday = todayIndex >= 0 ? (cumulativeActual[todayIndex] as number) : 0;

    const hasForecast = todayIndex >= 0 && todayIndex < totalDays - 1;
    const forecast = hasForecast
      ? cumulativeActual.map((value, index) => index >= todayIndex ? cumulativeToday : value === null ? null : null)
      : [];
    const markLineData = [
      ...weekBoundaryPositions.map((position) => ({ xAxis: labels[position] })),
      ...(hasForecast ? [{ yAxis: cumulativeToday }] : []),
    ];
    const config: MtdChartOption = {
      animation: false,
      grid: { top: 8, right: 8, bottom: 24, left: 8, containLabel: false },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const item = (Array.isArray(params) ? params[0] : params) as { dataIndex: number; value: number | null };
          const idx = item.dataIndex;
          const daily = dailyAmounts[idx];
          if (daily === null) return "";
          return `${new Date(year, month - 1, idx + 1).toLocaleDateString(undefined, { month: "short", day: "numeric" })}<br/>Daily: $${daily.toFixed(2)}<br/>Total: $${Number(item.value).toFixed(2)}`;
        },
      },
      xAxis: { type: "category", data: labels, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "var(--color-text-placeholder)", interval: "auto" }, splitLine: { show: false } },
      yAxis: { type: "value", show: false, min: 0 },
      series: [
        {
          type: "line",
          data: cumulativeActual,
          smooth: false,
          connectNulls: false,
          showSymbol: true,
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
          markLine: markLineData.length > 0 ? { symbol: "none", lineStyle: { color: forecastBorderColor, type: "dashed", width: 1.5 }, data: markLineData } : undefined,
        },
        ...(hasForecast ? [{
          type: "line" as const,
          data: forecast,
          smooth: false,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: forecastBorderColor, type: "dashed" as const, width: 1.5 },
          itemStyle: {
            color: "rgba(107,114,128,0.04)",
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
          areaStyle: { color: "rgba(107,114,128,0.06)" },
          tooltip: { show: false },
        }] : []),
      ],
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
  }, [dailyAmounts, weekBoundaryPositions, year, month]);

  return (
    <div className="home-chart-container" ref={containerRef} role="img" aria-label="Month-to-date spending">
    </div>
  );
}
