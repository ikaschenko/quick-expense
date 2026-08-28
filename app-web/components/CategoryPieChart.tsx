import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { PieSeriesOption } from "echarts/charts";
import type { LegendComponentOption, TooltipComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";
import { formatPctChange } from "../utils/dashboardStats";
import { OTHER_LABEL, PieSlice } from "../utils/monthDetails";

echarts.use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer]);

type PieOption = ComposeOption<PieSeriesOption | LegendComponentOption | TooltipComponentOption>;

export interface CategoryPieChartProps {
  slices: PieSlice[];
}

const MAX_LEGEND_LABEL_LENGTH = 30;
const LEGEND_ITEM_HEIGHT = 10;
const LEGEND_ITEM_GAP = 3;
const MIN_CHART_HEIGHT = 260;

function truncateLegendLabel(label: string): string {
  return label.length > MAX_LEGEND_LABEL_LENGTH ? `${label.slice(0, MAX_LEGEND_LABEL_LENGTH - 3)}...` : label;
}

export function buildCategoryPieLegend(slices: PieSlice[], textColor: string): LegendComponentOption {
  return {
    type: "plain",
    orient: "vertical",
    left: 0,
    top: "middle",
    width: "40%",
    selectedMode: true,
    data: slices.map((slice) => slice.label),
    selected: Object.fromEntries(slices.map((slice) => [slice.label, true])),
    itemHeight: LEGEND_ITEM_HEIGHT,
    itemGap: LEGEND_ITEM_GAP,
    formatter: (name: string) => truncateLegendLabel(name),
    textStyle: { color: textColor, fontSize: 9 },
  };
}

/** Category breakdown pie — percentages stay on the chart; full details come from the tooltip. */
export function CategoryPieChart({ slices }: CategoryPieChartProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const otherColor = useMemo(() => {
    const cssVars = getComputedStyle(document.documentElement);
    return cssVars.getPropertyValue("--color-chart-other").trim() || "#94A3B8";
  }, []);

  const labelColors = useMemo(() => {
    const cssVars = getComputedStyle(document.documentElement);
    return {
      name: cssVars.getPropertyValue("--color-text-primary").trim() || "#111827",
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || slices.length === 0) return;
    // jsdom (unit tests) has no real canvas 2D context — skip rendering rather than crash.
    if (!document.createElement("canvas").getContext("2d")) return;

    const chart = echarts.init(container);
    chartRef.current = chart;
    const legend = buildCategoryPieLegend(slices, labelColors.name);
    const allSelected = legend.selected ?? {};

    const option: PieOption = {
      legend,
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove|click|mousewheel",
        confine: true,
        formatter: (params) => {
          const p = params as { dataIndex: number };
          const slice = slices[p.dataIndex];
          return [
            `Category: ${slice.label}`,
            `Amount: $${slice.amount.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Share: ${formatPctChange(slice.pct)}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "pie",
          center: ["70%", "50%"],
          radius: "58%",
          data: slices.map((s) => ({
            name: s.label,
            value: s.amount,
            itemStyle: { color: s.label === OTHER_LABEL ? otherColor : s.color },
          })),
          itemStyle: {
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.2)",
            shadowOffsetY: 2,
          },
          label: {
            formatter: (params) => `${formatPctChange(slices[params.dataIndex].pct)}%`,
            color: labelColors.name,
            fontSize: 11,
          },
          labelLine: { show: true, length: 8, length2: 8 },
          labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
          emphasis: { focus: "self" },
          animation: false,
        },
      ],
    };
    chart.setOption(option);

    // Tapping empty chart area dismisses a click-triggered tooltip.
    const zr = chart.getZr();
    const dismiss = (e: { target?: unknown }): void => {
      if (!e.target) {
        chart.dispatchAction({ type: "hideTip" });
        chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
      }
    };
    zr.on("click", dismiss);

    const highlightLegendSlice = (event: unknown): void => {
      const params = event as { name: string };
      chart.setOption({ legend: { selected: allSelected } });
      chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
      const dataIndex = slices.findIndex((slice) => slice.label === params.name);
      if (dataIndex >= 0) chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex });
    };
    chart.on("legendselectchanged", highlightLegendSlice);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      zr.off("click", dismiss);
      chart.off("legendselectchanged", highlightLegendSlice);
      chart.dispose();
      chartRef.current = null;
    };
  }, [slices, otherColor, labelColors]);


  if (slices.length === 0) return null;

  const chartHeight = Math.max(
    MIN_CHART_HEIGHT,
    slices.length * (LEGEND_ITEM_HEIGHT + LEGEND_ITEM_GAP) + LEGEND_ITEM_GAP,
  );

  return (
    <div
      ref={containerRef}
      className="month-details-pie"
      style={{ height: `${chartHeight}px` }}
      role="img"
      aria-label="Spending by category"
    />
  );
}
