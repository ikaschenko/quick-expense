import { describe, it, expect } from "vitest";
import { getCategoryColor } from "../../app-web/utils/categoryColor";

describe("getCategoryColor", () => {
  it("returns the same color for the same category name across calls", () => {
    expect(getCategoryColor("Food")).toBe(getCategoryColor("Food"));
  });

  it("returns a valid hex color", () => {
    expect(getCategoryColor("Groceries")).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("distributes distinct names across the palette rather than collapsing to one color", () => {
    const names = Array.from({ length: 20 }, (_, i) => `Category ${i}`);
    const colors = new Set(names.map(getCategoryColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
