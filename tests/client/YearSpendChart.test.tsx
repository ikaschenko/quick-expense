import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import type { BarSeriesOption } from "echarts/charts";
import { buildSeries, resolveMonthClick, YearSpendChart } from "../../app-web/components/YearSpendChart";
import { createFakeChart, disableChartRendering, enableChartRendering } from "./fakeEchart";

vi.mock("echarts/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("echarts/core")>()),
  init: vi.fn(),
}));

function dataAt(series: BarSeriesOption, index: number) {
  return (series.data as unknown[])[index];
}

describe("YearSpendChart — buildSeries", () => {
  it("gives every past-year month a plain numeric value with the solid actual-month fill", () => {
    const monthlyAmounts = Array.from({ length: 12 }, (_, i) => i * 10);
    const [actualSeries] = buildSeries(monthlyAmounts, "gray", 50, "orange", null);

    expect(dataAt(actualSeries, 0)).toBe(0);
    expect(dataAt(actualSeries, 5)).toBe(50);
    expect(actualSeries.itemStyle).toEqual({ color: "rgba(79,70,229,0.9)" });
  });

  it("gives the current month the forecast fill with an indigo border, keeping its real value", () => {
    const monthlyAmounts: (number | null)[] = [10, 20, 30, null, null, null, null, null, null, null, null, null];
    const [actualSeries] = buildSeries(monthlyAmounts, "gray", 20, "orange", 2);

    const currentMonthData = dataAt(actualSeries, 2) as { value: number; itemStyle: Record<string, unknown> };
    expect(currentMonthData.value).toBe(30);
    expect(currentMonthData.itemStyle).toMatchObject({
      color: "rgba(107,114,128,0.15)",
      borderColor: "rgba(79,70,229,0.9)",
      borderWidth: 2,
    });
    expect(currentMonthData.itemStyle.decal).toBeDefined();

    // Past months are untouched — plain numeric values, no itemStyle override.
    expect(dataAt(actualSeries, 0)).toBe(10);
    expect(dataAt(actualSeries, 1)).toBe(20);
  });

  it("still emits a separate forecast placeholder series for the remaining future months", () => {
    const monthlyAmounts: (number | null)[] = [10, 20, 30, null, null, null, null, null, null, null, null, null];
    const series = buildSeries(monthlyAmounts, "gray", 20, "orange", 2);

    expect(series).toHaveLength(2);
    const [, forecastSeries] = series;
    expect(dataAt(forecastSeries, 2)).toBe(0); // current month has real data, not a placeholder
    expect(dataAt(forecastSeries, 3)).toBeGreaterThan(0);
  });

  it("omits the forecast series when the year has no remaining future months", () => {
    const monthlyAmounts = Array.from({ length: 12 }, () => 5);
    const series = buildSeries(monthlyAmounts, "gray", 5, "orange", 11);

    expect(series).toHaveLength(1);
  });
});

describe("YearSpendChart — resolveMonthClick", () => {
  const monthlyAmounts: (number | null)[] = [10, 20, null, null];

  it("ignores clicks on the forecast placeholder series", () => {
    expect(resolveMonthClick(1, 0, monthlyAmounts, false, null)).toEqual({ type: "ignore" });
  });

  it("ignores clicks on a null (forecast-only) month, even on the primary series", () => {
    expect(resolveMonthClick(0, 2, monthlyAmounts, false, null)).toEqual({ type: "ignore" });
  });

  it("navigates immediately on a mouse click of an actual-data bar", () => {
    expect(resolveMonthClick(0, 1, monthlyAmounts, false, null)).toEqual({ type: "navigate" });
  });

  it("arms the tooltip on a touch device's first tap of a bar", () => {
    expect(resolveMonthClick(0, 0, monthlyAmounts, true, null)).toEqual({ type: "arm" });
  });

  it("arms again when a different bar is tapped before the armed one", () => {
    expect(resolveMonthClick(0, 1, monthlyAmounts, true, 0)).toEqual({ type: "arm" });
  });

  it("navigates on a second touch tap of the same already-armed bar", () => {
    expect(resolveMonthClick(0, 0, monthlyAmounts, true, 0)).toEqual({ type: "navigate" });
  });
});

describe("YearSpendChart — rendering", () => {
  const monthlyAmounts: (number | null)[] = [100, 250.5, ...Array<null>(10).fill(null)];
  const touchClick = (dataIndex: number) => ({ seriesIndex: 0, dataIndex, event: { event: { pointerType: "touch" } } });

  beforeEach(enableChartRendering);
  afterEach(disableChartRendering);

  function renderChart(onMonthClick?: (year: number, month: number) => void) {
    const fake = createFakeChart();
    const view = render(
      <YearSpendChart monthlyAmounts={monthlyAmounts} year={2026} averagePerMonth={175} currentMonthIndex={1} onMonthClick={onMonthClick} />,
    );
    const option = fake.chart.setOption.mock.calls[0][0] as { tooltip: { formatter: (params: unknown) => string } };
    return { ...fake, view, formatter: option.tooltip.formatter };
  }

  it("should format the tooltip with month, year, and total", () => {
    const { formatter } = renderChart();

    expect(formatter([{ dataIndex: 1 }])).toBe("February 2026<br/>Total: $250.50");
    expect(formatter({ dataIndex: 0 })).toBe("January 2026<br/>Total: $100.00");
  });

  it("should return an empty tooltip for a forecast-only month", () => {
    const { formatter } = renderChart();

    expect(formatter([{ dataIndex: 5 }])).toBe("");
  });

  it("should ignore clicks when no month handler is provided", () => {
    const { chart, handlers } = renderChart();

    handlers.click({ seriesIndex: 0, dataIndex: 0 });

    expect(chart.dispatchAction).not.toHaveBeenCalled();
  });

  it("should navigate immediately on a mouse click", () => {
    const onMonthClick = vi.fn();
    const { handlers } = renderChart(onMonthClick);

    handlers.click({ seriesIndex: 0, dataIndex: 1 });

    expect(onMonthClick).toHaveBeenCalledWith(2026, 2);
  });

  it("should ignore clicks on a forecast-only month", () => {
    const onMonthClick = vi.fn();
    const { chart, handlers } = renderChart(onMonthClick);

    handlers.click(touchClick(5));

    expect(onMonthClick).not.toHaveBeenCalled();
    expect(chart.dispatchAction).not.toHaveBeenCalled();
  });

  it("should show the tooltip on the first touch tap and navigate on the second", () => {
    const onMonthClick = vi.fn();
    const { chart, handlers } = renderChart(onMonthClick);

    handlers.click(touchClick(0));
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: "showTip", seriesIndex: 0, dataIndex: 0 });
    expect(onMonthClick).not.toHaveBeenCalled();

    handlers.click(touchClick(0));
    expect(onMonthClick).toHaveBeenCalledWith(2026, 1);
  });

  it("should release the click listener and dispose the chart on unmount", () => {
    const { chart, view } = renderChart();

    view.unmount();

    expect(chart.off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(chart.dispose).toHaveBeenCalled();
  });
});
