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
  it("shows each category's share of the displayed current-month total to one decimal place", () => {
    const records = [
      makeRecord("2026-08-01", "10", "Food"),
      makeRecord("2026-08-02", "20", "Rent"),
      makeRecord("2026-08-03", "0", "Other"),
    ];
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );

    const table = screen.getByRole("table");
    expect(table.textContent).toContain("33.3%");
    expect(table.textContent).toContain("66.7%");
    expect(table.textContent).toContain("0.0%");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Category",
      "%",
      "Aug 2026",
      "Jul 2026",
    ]);
  });

  it("shows 0.0% for every category when the displayed current-month total is zero", () => {
    const records = [makeRecord("2026-08-01", "0", "Food"), makeRecord("2026-08-02", "0", "Rent")];
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );

    expect(screen.getByRole("table").textContent).toContain("0.0%");
    expect(screen.getAllByRole("cell", { name: "0.0%" })).toHaveLength(2);
  });

  it("keeps the current amount and deviation together with a non-breaking space", () => {
    const records = [
      makeRecord("2026-08-01", "115", "Food"),
      makeRecord("2026-07-01", "100", "Food"),
    ];
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-31" />,
    );

    const currentCell = screen.getByRole("row", { name: /Food/ }).querySelectorAll("td")[2];
    expect(currentCell.textContent).toContain("\u00a0(+15%)");
    expect(currentCell.querySelector(".month-details-current-value")?.className).toBe("month-details-current-value");
  });

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

  it("merges categories with the same first whole word when Group is toggled on", async () => {
    const user = userEvent.setup();
    const records = [makeRecord("2026-08-01", "5", "Food"), makeRecord("2026-08-02", "7", "Food - dining out")];
    render(
      <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-08-01" endDate="2026-08-06" />,
    );
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Food - dining out")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Group" }));
    expect(screen.getByText("Food...")).toBeTruthy();
    expect(screen.queryByText("Food - dining out")).toBeNull();
  });
});
