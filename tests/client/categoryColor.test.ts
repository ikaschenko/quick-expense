import { describe, it, expect } from "vitest";
import { getCategoryColor } from "../../app-web/utils/categoryColor";

describe("getCategoryColor", () => {
  it("starts with the colors sampled from the reference chart", () => {
    expect(Array.from({ length: 5 }, (_, index) => getCategoryColor(index))).toEqual([
      "#FF6800",
      "#A8B400",
      "#FF920F",
      "#4F7F0F",
      "#FFB74D",
    ]);
  });

  it("returns a valid hex color", () => {
    expect(getCategoryColor(0)).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("provides 25 unique colors before repeating", () => {
    const colors = Array.from({ length: 25 }, (_, index) => getCategoryColor(index));
    expect(new Set(colors)).toHaveLength(25);
  });

  it("restarts the palette after 25 colors", () => {
    expect(getCategoryColor(25)).toBe(getCategoryColor(0));
  });
});
