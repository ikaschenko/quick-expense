import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AddExpensePage } from "../src/pages/AddExpensePage";

vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    session: {
      guestAccessLevel: null,
      email: "test@example.com",
      givenName: "Test",
      picture: null,
      isGuest: false,
    },
    error: null,
    status: "signed_in",
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    touchSession: vi.fn(),
    clearError: vi.fn(),
  })),
}));

vi.mock("../src/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({
    config: {
      email: "test@example.com",
      spreadsheetId: "abc123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc123/edit",
      sheetName: "Expenses",
      currencies: [],
      customColumns: [],
      configMode: "default",
      predefinedCategories: [],
      hiddenColumns: [],
      isGuest: false,
      accessLevel: "edit",
      ownerEmail: null,
    },
    isConfigLoading: false,
    error: null,
    clearError: vi.fn(),
  })),
}));

vi.mock("../src/contexts/DatasetContext", () => ({
  useDataset: vi.fn(() => ({
    snapshot: { records: [], dateOrderIssueRows: [] },
    status: "loaded",
    error: null,
    isLoadingHistory: false,
    loadDataset: vi.fn(),
    reloadDataset: vi.fn(),
    appendToDataset: vi.fn(),
    updateInDataset: vi.fn(),
    removeLastFromDataset: vi.fn(),
    distinctValues: { Category: [], spentBy: [], customFields: {} },
    searchFilters: { comment: "", categories: [] },
    setSearchFilters: vi.fn(),
  })),
}));

vi.mock("../src/services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../src/services/googleSheets", () => ({
  googleSheetsService: {
    getAvailableCurrencies: vi.fn().mockResolvedValue({ currencies: [] }),
    getLatestFxRateBackup: vi.fn().mockResolvedValue(null),
    appendExpenseRow: vi.fn(),
    updateExpenseRow: vi.fn(),
  },
}));

vi.mock("../src/services/currency", () => ({
  currencyService: {
    fetchLiveRates: vi.fn().mockResolvedValue({}),
    parseManualFxRates: vi.fn().mockReturnValue({}),
    convertToUsdFromRates: vi.fn().mockReturnValue(null),
  },
}));

import { googleSheetsService } from "../src/services/googleSheets";
import { ExpenseRecord } from "../src/types/expense";

function renderAddPage() {
  return render(
    <MemoryRouter initialEntries={["/add"]}>
      <Routes>
        <Route path="/add" element={<AddExpensePage />} />
        <Route path="/home" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillMinimalForm() {
  const amountInput = screen.getByRole("textbox", { name: /Amount in USD/i });
  fireEvent.change(amountInput, { target: { value: "10.00" } });

  const categoryInput = document.getElementById("category-field") as HTMLInputElement;
  fireEvent.change(categoryInput, { target: { value: "Food" } });
}

describe("AddExpensePage — double-submit guard", () => {
  beforeEach(() => {
    vi.mocked(googleSheetsService.appendExpenseRow).mockReset();
  });

  it("disables save buttons while a save is in progress", async () => {
    let resolveAppend!: (val: { record: ExpenseRecord; insertMode: boolean }) => void;
    vi.mocked(googleSheetsService.appendExpenseRow).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAppend = resolve;
        }),
    );

    renderAddPage();
    fillMinimalForm();

    const saveBtn = screen.getByRole("button", { name: /Save & Continue/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn.disabled).toBe(true);
    });

    expect(vi.mocked(googleSheetsService.appendExpenseRow)).toHaveBeenCalledTimes(1);

    // Attempt a second programmatic submit while saving — the ref guard should block it
    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    expect(vi.mocked(googleSheetsService.appendExpenseRow)).toHaveBeenCalledTimes(1);

    // Resolve and clean up
    resolveAppend({
      record: {
        Date: "2026-06-30", USD: "10.00", Category: "Food",
        spentBy: "test@example.com", Comment: "",
        currencyAmounts: {}, customFields: {}, rowNumber: 2,
      },
      insertMode: false,
    });
  });
});
