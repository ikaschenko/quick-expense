import { fireEvent, render, screen } from "@testing-library/react";
import { YearDetailsPanel } from "../../app-web/components/YearDetailsPanel";
import { MonthDetailsPanel } from "../../app-web/components/MonthDetailsPanel";
import { ExpenseRecord } from "../../app-web/types/expense";

vi.mock("../../app-web/components/YearSpendChart", () => ({
  YearSpendChart: (props: {
    monthlyAmounts: (number | null)[];
    currentMonthIndex: number | null;
    averagePerMonth?: number | null;
    onMonthClick?: unknown;
    ariaLabel?: string;
  }) => (
    <div
      role="img"
      aria-label={props.ariaLabel ?? "Monthly spending for the selected year"}
      data-amounts={JSON.stringify(props.monthlyAmounts)}
      data-current-index={String(props.currentMonthIndex)}
      data-has-average={String(props.averagePerMonth != null)}
      data-has-click={String(props.onMonthClick !== undefined)}
    />
  ),
}));

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

describe("YearDetailsPanel — category monthly trend", () => {
  const TODAY = "2026-06-15";
  const trendChart = (label: string) => screen.queryByRole("img", { name: `${label} spending by month` });
  const amountsOf = (chart: HTMLElement | null) => JSON.parse(chart!.getAttribute("data-amounts")!) as (number | null)[];
  const zeros = (overrides: Record<number, number>, length = 12) =>
    Array.from({ length }, (_, i) => overrides[i] ?? 0);

  it("expands a category into a 12-month trend whose bars add up to the row amount", () => {
    const records = [
      makeRecord("2026-01-10", "30", "Food"),
      makeRecord("2026-03-05", "70", "Food"),
      makeRecord("2026-03-06", "999", "Rent"),
    ];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    expect(trendChart("Food")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    const amounts = amountsOf(trendChart("Food"));
    expect(amounts).toEqual([...zeros({ 0: 30, 2: 70 }, 6), ...Array(6).fill(null)]);
    expect(screen.getByText("Food · 2026 · by month")).toBeTruthy();
  });

  it("sums every member category of a merged row when Group is on", () => {
    const records = [
      makeRecord("2026-03-05", "100", "Food Groceries"),
      makeRecord("2026-04-05", "50", "Food Dining"),
      makeRecord("2026-04-06", "7", "Rent"),
    ];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food..." }));

    expect(amountsOf(trendChart("Food..."))).toEqual([...zeros({ 2: 100, 3: 50 }, 6), ...Array(6).fill(null)]);
  });

  it("covers only the single category when Group is off", () => {
    const records = [
      makeRecord("2026-03-05", "100", "Food Groceries"),
      makeRecord("2026-04-05", "50", "Food Dining"),
    ];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    fireEvent.click(screen.getByRole("button", { name: "Food Groceries" }));

    expect(amountsOf(trendChart("Food Groceries"))).toEqual([...zeros({ 2: 100 }, 6), ...Array(6).fill(null)]);
  });

  it("merges case and whitespace variants of a category into one trend", () => {
    const records = [makeRecord("2026-02-01", "10", "Food"), makeRecord("2026-03-01", "5", "  food ")];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    expect(amountsOf(trendChart("Food"))).toEqual([...zeros({ 1: 10, 2: 5 }, 6), ...Array(6).fill(null)]);
  });

  it("marks the current month and leaves future months empty for the in-progress year", () => {
    const records = [makeRecord("2026-06-01", "20", "Food")];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    const chart = trendChart("Food")!;
    expect(chart.getAttribute("data-current-index")).toBe("5");
    expect(amountsOf(chart).slice(5)).toEqual([20, ...Array(6).fill(null)]);
  });

  it("shows 12 real values and no current month for a completed year", () => {
    const records = [makeRecord("2024-01-10", "10", "Food"), makeRecord("2024-12-31", "5", "Food")];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2024} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    const chart = trendChart("Food")!;
    expect(chart.getAttribute("data-current-index")).toBe("null");
    expect(amountsOf(chart)).toEqual(zeros({ 0: 10, 11: 5 }));
  });

  it("renders twelve zero bars for a category whose USD total is zero", () => {
    render(<YearDetailsPanel records={[makeRecord("2024-05-01", "0", "Food")]} toIso={toIso} year={2024} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    expect(amountsOf(trendChart("Food"))).toEqual(zeros({}));
  });

  it("gives the trend chart no average line and no month drill-down", () => {
    render(
      <YearDetailsPanel records={[makeRecord("2026-03-01", "10", "Food")]} toIso={toIso} year={2026} today={TODAY} onMonthClick={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    const trend = trendChart("Food")!;
    expect(trend.getAttribute("data-has-average")).toBe("false");
    expect(trend.getAttribute("data-has-click")).toBe("false");
    const mainChart = screen.getByRole("img", { name: "Monthly spending for the selected year" });
    expect(mainChart.getAttribute("data-has-average")).toBe("true");
    expect(mainChart.getAttribute("data-has-click")).toBe("true");
  });

  it("collapses on a second click and keeps only one category expanded", () => {
    const records = [makeRecord("2026-03-01", "10", "Food"), makeRecord("2026-03-02", "5", "Rent")];
    render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    const food = screen.getByRole("button", { name: "Food" });
    fireEvent.click(food);
    expect(food.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Rent" }));
    expect(trendChart("Food")).toBeNull();
    expect(trendChart("Rent")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rent" }));
    expect(trendChart("Rent")).toBeNull();
  });

  it.each([
    ["Group toggle", () => fireEvent.click(screen.getByRole("button", { name: "Group" }))],
    ["Top 5 filter", () => fireEvent.click(screen.getByRole("button", { name: "Top 5" }))],
  ])("collapses the trend when the %s changes", (_name, change) => {
    render(<YearDetailsPanel records={[makeRecord("2026-03-01", "10", "Food")]} toIso={toIso} year={2026} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(trendChart("Food")).not.toBeNull();

    change();
    expect(trendChart("Food")).toBeNull();
  });

  it("collapses the trend when the displayed year changes", () => {
    const records = [makeRecord("2026-03-01", "10", "Food"), makeRecord("2025-03-01", "10", "Food")];
    const { rerender } = render(<YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    rerender(<YearDetailsPanel records={records} toIso={toIso} year={2025} today={TODAY} />);

    expect(trendChart("Food")).toBeNull();
  });

  it("does not collide aria-controls ids with a Month details panel on the same screen", () => {
    const records = [makeRecord("2026-06-01", "10", "Food")];
    render(
      <>
        <MonthDetailsPanel records={records} toIso={toIso} startDate="2026-06-01" endDate="2026-06-15" />
        <YearDetailsPanel records={records} toIso={toIso} year={2026} today={TODAY} />
      </>,
    );

    const [monthToggle, yearToggle] = screen.getAllByRole("button", { name: "Food" });
    fireEvent.click(monthToggle);
    fireEvent.click(yearToggle);

    expect(monthToggle.getAttribute("aria-controls")).not.toBe(yearToggle.getAttribute("aria-controls"));
    expect(document.getElementById(yearToggle.getAttribute("aria-controls")!)).not.toBeNull();
  });
});
