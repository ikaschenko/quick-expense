import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { PieSeriesOption } from "echarts/charts";
import type { TooltipComponentOption } from "echarts/components";
import type { ComposeOption } from "echarts/core";
import { formatPctChange } from "../utils/dashboardStats";
import { formatPieAmount, getLabeledSliceLabels, MAX_PIE_LABELS, OTHER_LABEL, PieSlice } from "../utils/monthDetails";

echarts.use([PieChart, TooltipComponent, CanvasRenderer]);

type PieOption = ComposeOption<PieSeriesOption | TooltipComponentOption>;

export interface CategoryPieChartProps {
  slices: PieSlice[];
}

/** Category breakdown pie — callouts are capped at `MAX_PIE_LABELS`; per-slice details come from a click/tap tooltip. */
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
      detail: cssVars.getPropertyValue("--color-text-secondary").trim() || "#6B7280",
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || slices.length === 0) return;
    // jsdom (unit tests) has no real canvas 2D context — skip rendering rather than crash.
    if (!document.createElement("canvas").getContext("2d")) return;

    const chart = echarts.init(container);
    chartRef.current = chart;

    const labeled = getLabeledSliceLabels(slices);

    const option: PieOption = {
      tooltip: {
        trigger: "item",
        triggerOn: "click",
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
          radius: "55%",
          data: slices.map((s) => ({
            name: s.label,
            value: s.amount,
            itemStyle: { color: s.label === OTHER_LABEL ? otherColor : s.color },
            label: { show: labeled.has(s.label) },
            labelLine: { show: labeled.has(s.label) },
          })),
          label: {
            formatter: (params) =>
              `{name|${params.name}}\n{detail|${formatPieAmount(params.value as number)} (${formatPctChange(slices[params.dataIndex].pct)}%)}`,
            rich: {
              name: { fontSize: 13, color: labelColors.name, lineHeight: 18 },
              detail: { fontSize: 10, color: labelColors.detail, lineHeight: 13 },
            },
            overflow: "truncate",
          },
          labelLine: { show: true },
          emphasis: { disabled: true },
          animation: false,
        },
      ],
    };
    chart.setOption(option);

    // Tapping empty chart area dismisses a click-triggered tooltip.
    const zr = chart.getZr();
    const dismiss = (e: { target?: unknown }): void => {
      if (!e.target) chart.dispatchAction({ type: "hideTip" });
    };
    zr.on("click", dismiss);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      zr.off("click", dismiss);
      chart.dispose();
      chartRef.current = null;
    };
  }, [slices, otherColor, labelColors]);


  if (slices.length === 0) return null;

  const hiddenCount = slices.length - MAX_PIE_LABELS;

  return (
    <>
      <div ref={containerRef} className="month-details-pie" role="img" aria-label="Spending by category" />
      {hiddenCount > 0 && (
        <p className="month-details-pie-hint">+{hiddenCount} smaller categories — tap a segment for details</p>
      )}
    </>
  );
}
