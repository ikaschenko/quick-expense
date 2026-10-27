import { render } from "@testing-library/react";
import { buildCategoryPieLayout, buildCategoryPieLegend, CategoryPieChart } from "../../app-web/components/CategoryPieChart";
import { OTHER_LABEL, PieSlice } from "../../app-web/utils/monthDetails";
import { createFakeChart, disableChartRendering, enableChartRendering } from "./fakeEchart";

vi.mock("echarts/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("echarts/core")>()),
  init: vi.fn(),
}));

type Formatter = (params: { dataIndex: number }) => string;
interface PieOptionShape {
  legend: { orient: string };
  tooltip: { formatter: Formatter };
  series: [{
    label: { formatter: Formatter; show: boolean };
    labelLayout: { hideOverlap: boolean };
    data: { itemStyle: { color: unknown }; label: { position: string; width: number }; labelLine: { show: boolean } }[];
  }];
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

  it("lists legend entries from the largest to the smallest share", () => {
    const legend = buildCategoryPieLegend(
      [makeSlice("Small", 10, 10), makeSlice("Big", 70, 70), makeSlice(OTHER_LABEL, 20, 20)],
      "#111827",
    );
    expect(legend.data).toEqual(["Big", OTHER_LABEL, "Small"]);
    expect(legend.orient).toBe("vertical");
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

  beforeEach(() => {
    enableChartRendering();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  });
  afterEach(() => {
    disableChartRendering();
    vi.restoreAllMocks();
  });

  function renderChart(chartSlices: PieSlice[] = slices) {
    const fake = createFakeChart();
    const view = render(<CategoryPieChart slices={chartSlices} />);
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

  it.each([[1.1, "1.1%"], [9.9, "9.9%"], [10, "10%"], [44.3, "44%"], [100, "100%"]])("preserves the full formatted percentage %s", (pct, text) => {
    const { option } = renderChart([makeSlice("Food", 100, pct)]);
    expect(option.series[0].label.formatter({ dataIndex: 0 })).toBe(text);
    expect(option.series[0].label.show).toBe(true);
    expect(option.series[0].labelLayout.hideOverlap).toBe(false);
    expect(option.series[0].data[0].label.width).toBeGreaterThan(0);
  });

  it("uses outside leader lines only when the complete label cannot fit inside", () => {
    const { option } = renderChart([makeSlice("Housing", 97, 97), makeSlice("Other", 3, 3)]);
    expect(option.series[0].data.map((item) => item.label.position)).toEqual(["inside", "outside"]);
    expect(option.series[0].data.map((item) => item.labelLine.show)).toEqual([false, true]);
  });

  it("centers the percentage of a single slice", () => {
    const { option } = renderChart([makeSlice("Food", 100, 100)]);
    expect(option.series[0].data[0].label.position).toBe("center");
    expect(option.series[0].data[0].labelLine.show).toBe(false);
  });

  it("uses measured text widths when a canvas context is available", () => {
    const measureText = vi.fn(() => ({ width: 37.4 }));
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({ measureText } as unknown as CanvasRenderingContext2D);
    const { option } = renderChart();
    expect(measureText).toHaveBeenCalledWith("62%");
    expect(option.series[0].data[0].label.width).toBe(40);
  });

  it("recalculates on width changes but ignores height feedback and zero-width observations", () => {
    let resize: () => void = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    const { chart } = renderChart();
    expect(chart.setOption).toHaveBeenCalledTimes(1);
    width.mockReturnValue(288);
    resize();
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    expect((chart.setOption.mock.calls[1][0] as PieOptionShape).legend.orient).toBe("vertical");
    resize();
    width.mockReturnValue(0);
    resize();
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    width.mockReturnValue(600);
    resize();
    expect((chart.setOption.mock.lastCall![0] as PieOptionShape).legend.orient).toBe("vertical");
  });

  it("waits until a hidden container has a measurable width", () => {
    let resize: () => void = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(0);
    const chart = createFakeChart().chart;
    render(<CategoryPieChart slices={slices} />);
    expect(chart.setOption).not.toHaveBeenCalled();
    width.mockReturnValue(288);
    resize();
    expect(chart.setOption).toHaveBeenCalledTimes(1);
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

describe("buildCategoryPieLayout", () => {
  const slices = [makeSlice("Housing", 80, 80), makeSlice("Food", 17, 17), makeSlice("Other", 3, 3)];
  const labelWidths = [24, 24, 30];
  const legendWidths = [40, 25, 30];

  it("places only fitting labels inside their slices", () => {
    const layout = buildCategoryPieLayout(slices, 600, labelWidths, legendWidths);
    expect(layout.inside).toEqual([true, true, false]);
  });

  it.each([240, 288, 320, 390, 600, 1440])("reserves complete callout gutters at width %s", (width) => {
    const layout = buildCategoryPieLayout(slices, width, labelWidths, legendWidths);
    expect((width - layout.left) / 2 - layout.radius).toBeGreaterThanOrEqual(55);
    expect(layout.radius * 2 + 24).toBeLessThanOrEqual(layout.plotHeight);
  });

  it("keeps the legend on the left at every width", () => {
    for (const width of [240, 288, 600]) {
      const layout = buildCategoryPieLayout(slices, width, labelWidths, legendWidths);
      expect(layout.left).toBeGreaterThan(0);
      expect(layout.left - 16).toBeLessThanOrEqual(Math.max(80, width * 0.35));
    }
  });

  it("keeps a single 100% label inside", () => {
    expect(buildCategoryPieLayout([makeSlice("Food", 100, 100)], 288, [32], [24]).inside).toEqual([true]);
  });

  it("falls back outside when the full text cannot fit", () => {
    expect(buildCategoryPieLayout(slices, 600, [180, 180, 180], legendWidths).inside).toEqual([false, false, false]);
  });

  it("grows vertically for dense external callouts and legend entries", () => {
    const many = Array.from({ length: 50 }, (_, index) => makeSlice(`Category ${index}`, 2, 2));
    const layout = buildCategoryPieLayout(many, 288, many.map(() => 30), many.map(() => 140));
    expect(layout.inside.every((value) => !value)).toBe(true);
    expect(layout.plotHeight).toBeGreaterThan(260);
    expect(layout.height).toBeGreaterThanOrEqual(layout.plotHeight);
  });

  it("handles no slices", () => {
    expect(buildCategoryPieLayout([], 320, [], []).inside).toEqual([]);
  });

  it("reserves vertical legend padding so entries cannot wrap into a second column", () => {
    const many = Array.from({ length: 20 }, (_, index) => makeSlice(`Category ${index}`, 5, 5));
    const layout = buildCategoryPieLayout(many, 600, many.map(() => 24), many.map(() => 140));
    expect(layout.height).toBeGreaterThanOrEqual(20 * 13 + 10);
  });
});
