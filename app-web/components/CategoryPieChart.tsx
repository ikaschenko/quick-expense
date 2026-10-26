import { useEffect, useMemo, useRef, type JSX } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { LabelLayout } from "echarts/features";
import type { PieSeriesOption } from "echarts/charts";
import type { LegendComponentOption, TooltipComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";
import { formatPctChange } from "../utils/dashboardStats";
import { OTHER_LABEL, PieSlice } from "../utils/monthDetails";

echarts.use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer, LabelLayout]);

type PieOption = ComposeOption<PieSeriesOption | LegendComponentOption | TooltipComponentOption>;

export interface CategoryPieChartProps {
  slices: PieSlice[];
}

const MAX_LEGEND_LABEL_LENGTH = 30;
const LEGEND_ITEM_HEIGHT = 10;
const LEGEND_ITEM_GAP = 3;
const MIN_CHART_HEIGHT = 260;

export function buildCategoryPieLayout(slices: PieSlice[], width: number, labelWidths: number[], legendWidths: number[]) {
  const padding = 12;
  const gutter = Math.max(36, ...labelWidths.map((value) => value + 25));
  const legendWidth = Math.min(200, Math.max(0, ...legendWidths) + 40);
  const stacked = width - legendWidth - 16 < 2 * gutter + 140;
  let legendRows = 1;
  let rowWidth = 0;
  for (const textWidth of legendWidths) {
    const entryWidth = Math.min(width - padding * 2, textWidth + 40);
    if (rowWidth > 0 && rowWidth + entryWidth > width - padding * 2) {
      legendRows += 1;
      rowWidth = 0;
    }
    rowWidth += entryWidth;
  }
  const top = stacked ? legendRows * 18 + 20 : 0;
  const left = stacked ? 0 : legendWidth + 16;
  const radius = Math.max(1, Math.min(110, (width - left) / 2 - gutter));
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  let angle = -Math.PI / 2;
  const outsideCounts = [0, 0];
  const inside = slices.map((slice, index) => {
    const span = total > 0 ? slice.amount / total * Math.PI * 2 : 0;
    const middle = angle + span / 2;
    angle += span;
    const distance = slices.length === 1 ? 0 : radius / 2 + 3;
    const centerX = Math.cos(middle) * distance;
    const centerY = Math.sin(middle) * distance;
    const halfWidth = (labelWidths[index] ?? 30) / 2 + 4;
    const fits = [-halfWidth, halfWidth].every((offsetX) => [-10, 10].every((offsetY) => {
      const cornerX = centerX + offsetX;
      const cornerY = centerY + offsetY;
      const cornerAngle = Math.atan2(cornerY, cornerX) - middle;
      const relativeAngle = Math.atan2(Math.sin(cornerAngle), Math.cos(cornerAngle));
      return Math.hypot(cornerX, cornerY) <= radius - 4 && Math.abs(relativeAngle) <= span / 2;
    }));
    if (!fits) outsideCounts[Math.cos(middle) < 0 ? 0 : 1] += 1;
    return fits;
  });
  const plotHeight = Math.max(MIN_CHART_HEIGHT, Math.max(...outsideCounts) * 20 + 32);
  const legendHeight = slices.length * (LEGEND_ITEM_HEIGHT + LEGEND_ITEM_GAP) + padding * 2;
  return { inside, left, top, radius, stacked, plotHeight, height: Math.max(top + plotHeight, stacked ? 0 : legendHeight) };
}

function truncateLegendLabel(label: string): string {
  return label.length > MAX_LEGEND_LABEL_LENGTH ? `${label.slice(0, MAX_LEGEND_LABEL_LENGTH - 3)}...` : label;
}

/** Blends a hex color toward white by `amount` (0-1), matching the reference chart's subtle highlight. */
function lighten(hex: string, amount: number): string {
  const num = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const value = (num >> shift) & 0xff;
    return Math.round(value + (255 - value) * amount);
  };
  return `#${((1 << 24) + (channel(16) << 16) + (channel(8) << 8) + channel(0)).toString(16).slice(1)}`;
}

/** Light-to-dark radial gradient from a base color, echoing the reference chart's subtle shading. */
function toSliceGradient(color: string): InstanceType<typeof echarts.graphic.RadialGradient> {
  return new echarts.graphic.RadialGradient(0.4, 0.4, 0.8, [
    { offset: 0, color: lighten(color, 0.35) },
    { offset: 1, color },
  ]);
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

    const context = document.createElement("canvas").getContext("2d");
    const measure = (text: string, size: number): number => {
      if (!context?.measureText) return text.length * size * 0.65;
      context.font = `${size}px sans-serif`;
      return Math.ceil(context.measureText(text).width);
    };
    const labelWidths = slices.map((slice) => measure(`${formatPctChange(slice.pct)}%`, 11) + 2);
    const legendWidths = slices.map((slice) => measure(truncateLegendLabel(slice.label), 9));
    let previousWidth = -1;
    const updateLayout = (): void => {
      const width = container.clientWidth;
      if (width <= 0) return;
      if (width === previousWidth) return;
      previousWidth = width;
      const layout = buildCategoryPieLayout(slices, width, labelWidths, legendWidths);
      container.style.height = `${layout.height}px`;
      chart.resize();
      const option: PieOption = {
        legend: {
          ...legend,
          orient: layout.stacked ? "horizontal" : "vertical",
          top: layout.stacked ? 0 : "middle",
          width: layout.stacked ? "100%" : layout.left - 16,
        },
        tooltip: {
          trigger: "item",
          triggerOn: "mousemove|click|mousewheel",
          confine: true,
          formatter: (params) => {
            const slice = slices[(params as { dataIndex: number }).dataIndex];
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
            left: layout.left,
            top: layout.top,
            height: layout.plotHeight,
            center: ["50%", "50%"],
            radius: layout.radius,
            data: slices.map((slice, index) => ({
              name: slice.label,
              value: slice.amount,
              itemStyle: { color: slice.label === OTHER_LABEL ? otherColor : toSliceGradient(slice.color) },
              label: {
                position: layout.inside[index] ? (slices.length === 1 ? "center" : "inside") : "outside",
                width: labelWidths[index],
                color: labelColors.name,
                textBorderColor: layout.inside[index] ? "#ffffff" : undefined,
                textBorderWidth: layout.inside[index] ? 2 : 0,
              },
              labelLine: { show: !layout.inside[index] },
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
              show: true,
              alignTo: "edge",
              edgeDistance: 12,
            },
            labelLine: { show: true, length: 8, length2: 8 },
            labelLayout: { hideOverlap: false },
            emphasis: { focus: "self" },
            animation: false,
          },
        ],
      };
      chart.setOption(option);
    };
    updateLayout();

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

    const resizeObserver = new ResizeObserver(updateLayout);
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
