import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExpenseTable } from "../src/components/ExpenseTable";
import { ExpenseRecord } from "../src/types/expense";
import { DayTotal } from "../src/utils/currencyTotals";

function makeRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    Date: "2026-01-15",
    USD: "25.00",
    Category: "Food",
    spentBy: "a@example.com",
    Comment: "Lunch",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
    ...overrides,
  };
}

describe("renderCardAmount — comma-formatted amounts", () => {
  it("displays amounts ≥ 1,000 in full without truncation at the thousands separator", () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    const record = makeRecord({
      USD: "$10,035.20",
      currencyAmounts: { BYN: "26,091.50" },
    });
    const { baseElement } = render(
      <ExpenseTable
        records={[record]}
        sheetCurrencies={["BYN"]}
      />,
    );
    expect(baseElement.textContent).toContain("26,091");
    expect(baseElement.textContent).toContain("10,035");
  });
});

describe("ExpenseTable — isViewOnly", () => {
  const record = makeRecord({ rowNumber: 1 });

  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    // jsdom does not implement scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("renders Edit button with aria-disabled when isViewOnly is true", () => {
    const onEditRequest = vi.fn();
    render(
      <ExpenseTable
        records={[record]}
        onEditRequest={onEditRequest}
        isViewOnly={true}
        highlightedRowNumber={1}
      />,
    );
    const editBtn = screen.getByRole("button", { name: /edit this expense/i });
    expect(editBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("does not call onEditRequest when locked Edit button is clicked", async () => {
    const user = userEvent.setup();
    const onEditRequest = vi.fn();
    render(
      <ExpenseTable
        records={[record]}
        onEditRequest={onEditRequest}
        isViewOnly={true}
        highlightedRowNumber={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit this expense/i }));
    expect(onEditRequest).not.toHaveBeenCalled();
  });

  it("shows alert when locked Edit button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ExpenseTable
        records={[record]}
        onEditRequest={vi.fn()}
        isViewOnly={true}
        highlightedRowNumber={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit this expense/i }));
    expect(window.alert).toHaveBeenCalledWith(
      "You don't have permission for this action. Contact the setup owner to request access.",
    );
  });

  it("renders Delete button with aria-disabled when isViewOnly is true and record is last", () => {
    const onDeleteRequest = vi.fn();
    render(
      <ExpenseTable
        records={[record]}
        lastRecordRowNumber={1}
        onDeleteRequest={onDeleteRequest}
        isViewOnly={true}
        highlightedRowNumber={1}
      />,
    );
    const deleteBtn = screen.getByRole("button", { name: /delete this expense/i });
    expect(deleteBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("does not call onDeleteRequest when locked Delete button is clicked", async () => {
    const user = userEvent.setup();
    const onDeleteRequest = vi.fn();
    render(
      <ExpenseTable
        records={[record]}
        lastRecordRowNumber={1}
        onDeleteRequest={onDeleteRequest}
        isViewOnly={true}
        highlightedRowNumber={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: /delete this expense/i }));
    expect(onDeleteRequest).not.toHaveBeenCalled();
  });

  it("calls onEditRequest normally when isViewOnly is false", async () => {
    const user = userEvent.setup();
    const onEditRequest = vi.fn();
    render(
      <ExpenseTable
        records={[record]}
        onEditRequest={onEditRequest}
        isViewOnly={false}
        highlightedRowNumber={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: /edit this expense/i }));
    expect(onEditRequest).toHaveBeenCalledWith(record);
  });
});

describe("ExpenseCard — expand/collapse vs. text selection", () => {
  const record = makeRecord({ rowNumber: 1 });

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("toggles expand/collapse on a plain click with no active selection", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseTable records={[record]} sheetCurrencies={[]} />);
    const card = container.querySelector(".expense-card") as HTMLElement;

    expect(screen.queryByText("Comment:")).toBeNull();
    await user.click(card);
    expect(screen.getByText("Comment:")).toBeTruthy();
    await user.click(card);
    expect(screen.queryByText("Comment:")).toBeNull();
  });

  it("does not collapse the card when the click follows a text selection", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseTable records={[record]} sheetCurrencies={[]} />);
    const card = container.querySelector(".expense-card") as HTMLElement;

    await user.click(card);
    expect(screen.getByText("Comment:")).toBeTruthy();

    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Lunch" } as Selection);
    await user.click(card);
    expect(screen.getByText("Comment:")).toBeTruthy();
  });

  it("collapses normally once a prior selection is cleared before the next click", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseTable records={[record]} sheetCurrencies={[]} />);
    const card = container.querySelector(".expense-card") as HTMLElement;

    await user.click(card);
    expect(screen.getByText("Comment:")).toBeTruthy();

    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Lunch" } as Selection);
    await user.click(card);
    expect(screen.getByText("Comment:")).toBeTruthy();

    getSelectionSpy.mockReturnValue({ toString: () => "" } as Selection);
    await user.click(card);
    expect(screen.queryByText("Comment:")).toBeNull();
  });

  it("still invokes the Edit action and does not toggle the card when clicked during an active selection", async () => {
    const user = userEvent.setup();
    const onEditRequest = vi.fn();
    const { container } = render(
      <ExpenseTable records={[record]} sheetCurrencies={[]} onEditRequest={onEditRequest} />,
    );
    const card = container.querySelector(".expense-card") as HTMLElement;

    await user.click(card);
    expect(screen.getByText("Comment:")).toBeTruthy();

    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Lunch" } as Selection);
    await user.click(screen.getByRole("button", { name: /edit this expense/i }));

    expect(onEditRequest).toHaveBeenCalledWith(record);
    expect(screen.getByText("Comment:")).toBeTruthy();
  });
});

describe("ExpenseTable — per-day total badges", () => {
  const record = makeRecord({ Date: "2026-06-09", rowNumber: 1 });

  it("renders the USD total badge when dayTotals has an entry for the group's date", () => {
    const dayTotals = new Map<string, DayTotal>([
      ["2026-06-09", { usdTotal: 45, dualCurrency: null }],
    ]);
    const { container } = render(<ExpenseTable records={[record]} dayTotals={dayTotals} />);
    const badge = container.querySelector(".expense-date-badge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain("45");
  });

  it("renders a secondary badge when the day shares one non-USD currency", () => {
    const dayTotals = new Map<string, DayTotal>([
      ["2026-06-09", { usdTotal: 45, dualCurrency: { code: "PLN", amount: 180 } }],
    ]);
    const { container } = render(<ExpenseTable records={[record]} dayTotals={dayTotals} />);
    expect(container.textContent).toContain("PLN");
    expect(container.querySelectorAll(".expense-date-badge")).toHaveLength(2);
  });

  it("does not render a secondary badge when dualCurrency is null (mixed-currency day)", () => {
    const dayTotals = new Map<string, DayTotal>([
      ["2026-06-09", { usdTotal: 45, dualCurrency: null }],
    ]);
    const { container } = render(<ExpenseTable records={[record]} dayTotals={dayTotals} />);
    expect(container.querySelectorAll(".expense-date-badge")).toHaveLength(1);
  });

  it("renders no badge when the dayTotals prop is omitted", () => {
    const { container } = render(<ExpenseTable records={[record]} />);
    expect(container.querySelector(".expense-date-badge")).toBeNull();
  });

  it("renders no badge when dayTotals has no entry for the group's date", () => {
    const dayTotals = new Map<string, DayTotal>([
      ["2026-01-01", { usdTotal: 45, dualCurrency: null }],
    ]);
    const { container } = render(<ExpenseTable records={[record]} dayTotals={dayTotals} />);
    expect(container.querySelector(".expense-date-badge")).toBeNull();
  });
});
