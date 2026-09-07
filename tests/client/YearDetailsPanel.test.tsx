import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { YearDetailsPanel } from "../../app-web/components/YearDetailsPanel";
import { ExpenseRecord } from "../../app-web/types/expense";

function makeRecord(date: string, usd: string, category: string): ExpenseRecord {
  return {
    Date: date,
    USD: usd,
    Category: category,
    spentBy: "test",
    spentFor: "test",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
  };
}

const toIso = (s: string) => s;

describe("YearDetailsPanel — isLoading", () => {
  it("renders a spinner instead of stats while isLoading is true", () => {
    render(<YearDetailsPanel records={[]} toIso={toIso} year={2026} today="2026-06-15" isLoading />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText(/Average spent per month/)).toBeNull();
  });
});

describe("YearDetailsPanel — category breakdown", () => {
  it("does not render the category section when the selected year has no records", () => {
    render(<YearDetailsPanel records={[]} toIso={toIso} year={2026} today="2026-06-15" />);
    expect(screen.getByText(/Average spent per month/).textContent).toContain("No data");
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("compares the current (YTD) year against the same YTD range in the prior year", () => {
    const records = [
      makeRecord("2026-03-01", "100", "Food"),
      makeRecord("2025-03-01", "80", "Food"),
      // Falls after the YTD cutoff in the prior year — must not count toward the comparison.
      makeRecord("2025-09-01", "999", "Food"),
    ];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today="2026-06-15" />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Category", "%", "2026", "2025"]);
    const row = screen.getByRole("row", { name: /Food/ });
    expect(row.textContent).toContain("$80");
    expect(row.textContent).toContain("(+25%)");
  });

  it("compares a completed past year against the full prior calendar year", () => {
    const records = [
      makeRecord("2024-06-01", "100", "Food"),
      makeRecord("2023-01-01", "40", "Food"),
      makeRecord("2023-12-31", "10", "Food"),
    ];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2024} today="2026-06-15" />);

    const row = screen.getByRole("row", { name: /Food/ });
    expect(row.textContent).toContain("$50");
  });

  it("shows '-' for a category with no comparable prior-year amount", () => {
    const records = [makeRecord("2026-03-01", "100", "Food")];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today="2026-06-15" />);

    const row = screen.getByRole("row", { name: /Food/ });
    expect(row.querySelectorAll("td")[3].textContent).toBe("-");
  });

  it("defaults the Group toggle to on", () => {
    const records = [makeRecord("2026-03-01", "100", "Food")];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today="2026-06-15" />);
    expect(screen.getByRole("button", { name: "Group" }).getAttribute("aria-pressed")).toBe("true");
  });
});
