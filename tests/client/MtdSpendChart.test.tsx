import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MtdSpendChart } from "../../app-web/components/MtdSpendChart";
import { createFakeChart, disableChartRendering, enableChartRendering } from "./fakeEchart";

vi.mock("echarts/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("echarts/core")>()),
  init: vi.fn(),
}));

interface MtdOptionShape {
  tooltip: { formatter: (params: unknown) => string };
  series: { data: (number | null)[] }[];
}

function renderChart(dailyAmounts: (number | null)[]) {
  const fake = createFakeChart();
  const view = render(<MtdSpendChart dailyAmounts={dailyAmounts} year={2026} month={9} />);
  const option = fake.chart.setOption.mock.calls[0][0] as MtdOptionShape;
  return { ...fake, view, option };
}

describe("MtdSpendChart", () => {
  beforeEach(enableChartRendering);
  afterEach(disableChartRendering);

  it("should render nothing chart-related when canvas is unavailable", () => {
    disableChartRendering();
    const fake = createFakeChart();

    render(<MtdSpendChart dailyAmounts={[10]} year={2026} month={9} />);

    expect(fake.chart.setOption).not.toHaveBeenCalled();
  });

  it("should plot the running total with a flat forecast for the rest of the month", () => {
    const { option } = renderChart([10, null, 5, null, null]);

    expect(option.series).toHaveLength(2);
    expect(option.series[0].data).toEqual([10, null, 15, null, null]);
    expect(option.series[1].data).toEqual([null, null, 15, 15, 15]);
  });

  it("should omit the forecast once the last day has data", () => {
    const { option } = renderChart([10, 20, 30]);

    expect(option.series).toHaveLength(1);
    expect(option.series[0].data).toEqual([10, 30, 60]);
  });

  it("should omit the forecast when no day has data", () => {
    const { option } = renderChart([null, null, null]);

    expect(option.series).toHaveLength(1);
  });

  it("should format the tooltip with daily and cumulative totals", () => {
    const { option } = renderChart([10, 5.5, null]);

    const tooltip = option.tooltip.formatter([{ dataIndex: 1, value: 15.5 }]);

    expect(tooltip).toContain("Daily: $5.50");
    expect(tooltip).toContain("Total: $15.50");
  });

  it("should return an empty tooltip for a day without data", () => {
    const { option } = renderChart([10, null, null]);

    expect(option.tooltip.formatter({ dataIndex: 2, value: null })).toBe("");
  });

  it("should dispose the chart on unmount", () => {
    const { chart, view } = renderChart([10]);

    view.unmount();

    expect(chart.dispose).toHaveBeenCalled();
  });
});
