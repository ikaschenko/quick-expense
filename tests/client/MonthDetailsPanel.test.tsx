import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("MonthDetailsPanel — controls", () => {
  it("shows 'No expenses in this period.' when the range has no records", () => {
    render(
      <MonthDetailsPanel records={[]} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );
    expect(screen.getByText("No expenses in this period.")).toBeTruthy();
  });

  it("limits rows to 5 when Top 5 is selected, and restores all rows when All is re-selected", async () => {
    const user = userEvent.setup();
    const records = ["A", "B", "C", "D", "E", "F"].map((c, i) => makeRecord(`2026-08-0${i + 1}`, "10", c));
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(7); // header + 6 categories

    await user.click(screen.getByRole("button", { name: "Top 5" }));
    expect(screen.getAllByRole("row")).toHaveLength(6); // header + 5 categories

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("row")).toHaveLength(7);
  });

  it("merges colliding-prefix categories into one row when Group is toggled on", async () => {
    const user = userEvent.setup();
    const records = [makeRecord("2026-08-01", "5", "Food"), makeRecord("2026-08-02", "7", "Food - dining out")];
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Food - dining out")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Group" }));
    expect(screen.getByText("Foo...")).toBeTruthy();
    expect(screen.queryByText("Food - dining out")).toBeNull();
  });
});
