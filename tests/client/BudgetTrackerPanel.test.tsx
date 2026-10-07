import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetTrackerPanel } from "../../app-web/components/BudgetTrackerPanel";
import { ExpenseRecord } from "../../app-web/types/expense";

const EMAIL = "user@example.com";
const KEY = "qe_budget_user@example.com";

function rec(date: string, usd: string): ExpenseRecord {
  return { Date: date, USD: usd, Category: "Trip", spentBy: "a", spentFor: "a", Comment: "", currencyAmounts: {}, customFields: {}, rowNumber: 1 };
}

// 300 spent Jul 1–10 → 30/day.
const TRIP = [rec("2026-07-01", "100"), rec("2026-07-05", "100"), rec("2026-07-10", "100")];

function renderPanel(records = TRIP, dateFrom = "") {
  return render(<BudgetTrackerPanel records={records} dateFrom={dateFrom} email={EMAIL} />);
}

describe("BudgetTrackerPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 10, 12));
    localStorage.clear();
    localStorage.setItem("qe_date_display_format", "iso");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should prompt for a budget or end date when none is set", () => {
    renderPanel();

    expect(screen.getByRole("status").textContent).toBe("Add a budget or end date to see a projection.");
  });

  it("should restore saved settings and show the matching verdict", () => {
    localStorage.setItem(KEY, JSON.stringify({ budgetUsd: 450, endDate: "2026-07-20" }));

    renderPanel();

    expect((screen.getByLabelText("Budget (USD)") as HTMLInputElement).value).toBe("450");
    expect(screen.getByRole("status").textContent).toBe("Budget runs out between 2026-07-15 and 2026-07-16, 4–5 days before end");
  });

  it("should save a valid budget and update the verdict", () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText("Budget (USD)"), { target: { value: "450" } });

    expect(screen.getByRole("status").textContent).toBe("Budget runs out between 2026-07-15 and 2026-07-16");
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual({ budgetUsd: 450, endDate: null });
  });

  it.each(["0", "-10"])("should show an error and ignore a budget of %s", (value) => {
    renderPanel();

    fireEvent.change(screen.getByLabelText("Budget (USD)"), { target: { value } });

    expect(screen.getByText("Enter a budget greater than 0.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Add a budget or end date to see a projection.");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("should remove saved settings when the budget is cleared", () => {
    localStorage.setItem(KEY, JSON.stringify({ budgetUsd: 450, endDate: null }));
    renderPanel();

    fireEvent.change(screen.getByLabelText("Budget (USD)"), { target: { value: "" } });

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("should keep saved settings when opened with a different filter", () => {
    localStorage.setItem(KEY, JSON.stringify({ budgetUsd: 1000, endDate: null }));

    renderPanel([rec("2026-07-08", "10"), rec("2026-07-09", "10"), rec("2026-07-10", "10")], "2026-07-08");

    expect((screen.getByLabelText("Budget (USD)") as HTMLInputElement).value).toBe("1000");
    expect(screen.getByRole("status").textContent).toBe("Budget runs out ~2026-10-15");
  });

  it("should flag an end date before the timeline start", () => {
    localStorage.setItem(KEY, JSON.stringify({ budgetUsd: null, endDate: "2026-06-01" }));

    renderPanel();

    expect(screen.getByText("End date must be on or after 2026-07-01.")).toBeTruthy();
  });

  it("should highlight an over-budget verdict", () => {
    localStorage.setItem(KEY, JSON.stringify({ budgetUsd: 150, endDate: null }));

    renderPanel();

    const verdict = screen.getByRole("status");
    expect(verdict.textContent).toBe("Over budget by $150.00 since 2026-07-05");
    expect(verdict.className).toContain("budget-tracker-verdict--alert");
  });

  it("should use the warning style when exactly one pace exceeds the end-date budget", () => {
    localStorage.setItem(KEY, JSON.stringify({ budgetUsd: 590, endDate: "2026-07-20" }));

    renderPanel();

    expect(screen.getByRole("status").className).toContain("budget-tracker-verdict--warning");
  });

  it("should toggle the projection info text", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /show info about budget projection/i }));

    expect(screen.getByText("Range between your average daily spending since the start date and over the last 7 days.")).toBeTruthy();
  });

  it("should explain when no match has a valid date", () => {
    renderPanel([rec("", "10")]);

    expect(screen.getByRole("status").textContent).toBe("No dated expenses to show.");
  });
});
