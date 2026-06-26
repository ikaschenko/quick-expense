import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExpenseTable } from "../src/components/ExpenseTable";
import { ExpenseRecord } from "../src/types/expense";

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
