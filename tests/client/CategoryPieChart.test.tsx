import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCategoryPieLegend, CategoryPieChart } from "../../app-web/components/CategoryPieChart";
import { OTHER_LABEL, PieSlice } from "../../app-web/utils/monthDetails";
import { createFakeChart, disableChartRendering, enableChartRendering } from "./fakeEchart";

vi.mock("echarts/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("echarts/core")>()),
  init: vi.fn(),
}));

type Formatter = (params: { dataIndex: number }) => string;
interface PieOptionShape {
  tooltip: { formatter: Formatter };
  series: [{ label: { formatter: Formatter }; data: { itemStyle: { color: unknown } }[] }];
}

function makeSlice(label: string, amount: number, pct: number): PieSlice {
  return { label, amount, pct, color: "#4E79A7" };
}

describe("CategoryPieChart", () => {
  it("configures a compact plain legend with every category selected", () => {
    const legend = buildCategoryPieLegend(
      [makeSlice("Food", 100, 50), makeSlice("A very long category label that is truncated", 100, 50)],
      "#111827",
    );

    expect(legend.type).toBe("plain");
    expect(legend.selectedMode).toBe(true);
    expect(legend.selected).toEqual({
      Food: true,
      "A very long category label that is truncated": true,
    });
    expect(legend.itemHeight).toBe(10);
    expect(legend.itemGap).toBe(3);
    expect(legend.textStyle).toMatchObject({ color: "#111827", fontSize: 9 });
    expect(typeof legend.formatter).toBe("function");
    const formattedLabel = (legend.formatter as (name: string) => string)("A very long category label that is truncated");
    expect(formattedLabel).toHaveLength(30);
    expect(formattedLabel).toMatch(/\.\.\.$/);
  });

  it("renders nothing when there are no slices", () => {
    const { container } = render(<CategoryPieChart slices={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a chart container for a single slice", () => {
    const { container } = render(<CategoryPieChart slices={[makeSlice("Food", 100, 100)]} />);
    expect(container.querySelector(".month-details-pie")).toBeTruthy();
  });

  it("renders without crashing for 20 slices", () => {
    const slices = Array.from({ length: 20 }, (_, i) => makeSlice(`Category ${i}`, 10, 5));
    const { container } = render(<CategoryPieChart slices={slices} />);
    expect(container.querySelector(".month-details-pie")).toBeTruthy();
  });

  it("grows the chart container for additional legend entries", () => {
    const singleSlice = render(<CategoryPieChart slices={[makeSlice("Food", 100, 100)]} />);
    const singleHeight = singleSlice.container.querySelector<HTMLElement>(".month-details-pie")?.style.height;
    singleSlice.unmount();

    const slices = Array.from({ length: 20 }, (_, i) => makeSlice(`Category ${i}`, 10, 5));
    const { container } = render(<CategoryPieChart slices={slices} />);
    const manyHeight = container.querySelector<HTMLElement>(".month-details-pie")?.style.height;

    expect(Number.parseInt(manyHeight ?? "0", 10)).toBeGreaterThan(Number.parseInt(singleHeight ?? "0", 10));
  });

  it("renders without a callout-cap hint for many slices", () => {
    const slices = Array.from({ length: 20 }, (_, i) => makeSlice(`Category ${i}`, 10, 5));
    const { container } = render(<CategoryPieChart slices={slices} />);
    expect(container.querySelector(".month-details-pie-hint")).toBeNull();
  });
});

describe("CategoryPieChart — rendering", () => {
  const slices = [makeSlice("Food", 1234.5, 61.7), makeSlice(OTHER_LABEL, 765.5, 38.3)];

  beforeEach(enableChartRendering);
  afterEach(disableChartRendering);

  function renderChart() {
    const fake = createFakeChart();
    const view = render(<CategoryPieChart slices={slices} />);
    const option = fake.chart.setOption.mock.calls[0][0] as PieOptionShape;
    return { ...fake, view, option };
  }

  it("should format the tooltip with category, amount, and share", () => {
    const { option } = renderChart();

    const tooltip = option.tooltip.formatter({ dataIndex: 0 });

    expect(tooltip).toContain("Category: Food");
    expect(tooltip).toContain("Amount: $1,234.50");
    expect(tooltip).toContain("Share: ");
  });

  it("should label each slice with its percentage", () => {
    const { option } = renderChart();

    expect(option.series[0].label.formatter({ dataIndex: 1 })).toMatch(/%$/);
  });

  it("should use a gradient for regular slices and a flat color for Other", () => {
    const { option } = renderChart();

    expect(typeof option.series[0].data[0].itemStyle.color).toBe("object");
    expect(option.series[0].data[1].itemStyle.color).toBe("#94A3B8");
  });

  it("should dismiss the tooltip when empty chart area is clicked", () => {
    const { chart, zrHandlers } = renderChart();

    zrHandlers.click({ target: undefined });

    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: "hideTip" });
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: "downplay", seriesIndex: 0 });
  });

  it("should keep the tooltip when a slice is clicked", () => {
    const { chart, zrHandlers } = renderChart();

    zrHandlers.click({ target: {} });

    expect(chart.dispatchAction).not.toHaveBeenCalled();
  });

  it("should keep every slice selected and highlight the clicked legend entry", () => {
    const { chart, handlers } = renderChart();

    handlers.legendselectchanged({ name: OTHER_LABEL });

    expect(chart.setOption).toHaveBeenLastCalledWith({ legend: { selected: { Food: true, [OTHER_LABEL]: true } } });
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: "highlight", seriesIndex: 0, dataIndex: 1 });
  });

  it("should not highlight anything for an unknown legend entry", () => {
    const { chart, handlers } = renderChart();

    handlers.legendselectchanged({ name: "Missing" });

    expect(chart.dispatchAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: "highlight" }));
  });

  it("should release listeners and dispose the chart on unmount", () => {
    const { chart, zr, view } = renderChart();

    view.unmount();

    expect(zr.off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(chart.off).toHaveBeenCalledWith("legendselectchanged", expect.any(Function));
    expect(chart.dispose).toHaveBeenCalled();
  });
});
