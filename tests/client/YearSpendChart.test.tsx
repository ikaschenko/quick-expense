import { describe, it, expect } from "vitest";
import type { BarSeriesOption } from "echarts/charts";
import { buildSeries } from "../../app-web/components/YearSpendChart";

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
