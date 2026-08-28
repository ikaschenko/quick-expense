import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { buildCategoryPieLegend, CategoryPieChart } from "../../app-web/components/CategoryPieChart";
import { PieSlice } from "../../app-web/utils/monthDetails";

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
