import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CategoryPieChart } from "../../app-web/components/CategoryPieChart";
import { PieSlice } from "../../app-web/utils/monthDetails";

function makeSlice(label: string, amount: number, pct: number): PieSlice {
  return { label, amount, pct, color: "#4E79A7" };
}

describe("CategoryPieChart", () => {
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

  it("hints how many callouts were dropped once the label cap is exceeded", () => {
    const slices = Array.from({ length: 20 }, (_, i) => makeSlice(`Category ${i}`, 10, 5));
    const { container } = render(<CategoryPieChart slices={slices} />);
    expect(container.querySelector(".month-details-pie-hint")?.textContent).toContain("+10");
  });

  it("shows no hint when every slice keeps its callout", () => {
    const slices = Array.from({ length: 10 }, (_, i) => makeSlice(`Category ${i}`, 10, 10));
    const { container } = render(<CategoryPieChart slices={slices} />);
    expect(container.querySelector(".month-details-pie-hint")).toBeNull();
  });
});
