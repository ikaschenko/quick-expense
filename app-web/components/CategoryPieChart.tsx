import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import type { PieSeriesOption } from "echarts/charts";
import type { ComposeOption } from "echarts/core";
import { OTHER_LABEL, PieSlice } from "../utils/monthDetails";

echarts.use([PieChart, CanvasRenderer]);

type PieOption = ComposeOption<PieSeriesOption>;

export interface CategoryPieChartProps {
  slices: PieSlice[];
}

/** Read-only category breakdown pie — no click/hover-select interaction (by design, see issue #94). */
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

    const option: PieOption = {
      series: [
        {
          type: "pie",
          radius: "55%",
          silent: true,
          data: slices.map((s) => ({
            name: s.label,
            value: s.amount,
            itemStyle: { color: s.label === OTHER_LABEL ? otherColor : s.color },
          })),
          label: {
            formatter: (params) =>
              `{name|${params.name}}\n{detail|$${(params.value as number).toFixed(2)} (${params.percent}%)}`,
            rich: {
              name: { fontSize: 13, color: labelColors.name, lineHeight: 18 },
              detail: { fontSize: 11, color: labelColors.detail, lineHeight: 15 },
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

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [slices, otherColor, labelColors]);


  if (slices.length === 0) return null;

  return <div ref={containerRef} className="month-details-pie" role="img" aria-label="Spending by category" />;
}
