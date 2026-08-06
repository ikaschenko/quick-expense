import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MonthDetailsPanel } from "../../app-web/components/MonthDetailsPanel";
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

describe("MonthDetailsPanel — isLoading", () => {
  it("renders a spinner instead of stats while isLoading is true", () => {
    render(
      <MonthDetailsPanel
        records={[]}
        toIso={toIso}
        startDate="2026-08-01"
        endDate="2026-08-06"
        isLoading
      />,
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText(/Average spent per day/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
  });

  it("renders the average and category table once isLoading is false", () => {
    const records = [makeRecord("2026-08-01", "20", "Food")];
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );
    expect(screen.getByText(/Average spent per day/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Group" })).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
