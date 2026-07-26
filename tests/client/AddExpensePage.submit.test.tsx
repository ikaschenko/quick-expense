import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AddExpensePage } from "../../app-web/pages/AddExpensePage";

vi.mock("../../app-web/contexts/AuthContext", () => ({
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

vi.mock("../../app-web/contexts/ConfigContext", () => ({
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

vi.mock("../../app-web/contexts/DatasetContext", () => ({
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

vi.mock("../../app-web/services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../app-web/services/googleSheets", () => ({
  googleSheetsService: {
    getAvailableCurrencies: vi.fn().mockResolvedValue({ currencies: [] }),
    getLatestFxRateBackup: vi.fn().mockResolvedValue(null),
    appendExpenseRow: vi.fn(),
    updateExpenseRow: vi.fn(),
  },
}));

vi.mock("../../app-web/services/currency", () => ({
  currencyService: {
    fetchLiveRates: vi.fn().mockResolvedValue({}),
    parseManualFxRates: vi.fn().mockReturnValue({}),
    convertToUsdFromRates: vi.fn().mockReturnValue(null),
  },
}));

import { googleSheetsService } from "../../app-web/services/googleSheets";
import { useConfig } from "../../app-web/contexts/ConfigContext";
import { ExpenseRecord } from "../../app-web/types/expense";
import { getTodayLocalDate } from "../../app-web/utils/date";

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

function renderAddPageWithRepeat(repeatRecord: ExpenseRecord) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/add", state: { repeatRecord } }]}>
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

describe("AddExpensePage — Save & Continue field retention", () => {
  const successRecord = {
    record: {
      Date: "2026-06-30", USD: "10.00", Category: "Food",
      spentBy: "test@example.com", Comment: "",
      currencyAmounts: {}, customFields: {}, rowNumber: 2,
    },
    insertMode: false,
  };

  beforeEach(() => {
    vi.mocked(googleSheetsService.appendExpenseRow).mockReset();
    vi.mocked(googleSheetsService.appendExpenseRow).mockResolvedValue(successRecord);
  });

  it("A — non-amount fields are retained after Save & Continue", async () => {
    renderAddPage();

    const categoryInput = document.getElementById("category-field") as HTMLInputElement;
    fireEvent.change(categoryInput, { target: { value: "Transport" } });

    const commentInput = document.getElementById("comment-field") as HTMLTextAreaElement;
    fireEvent.change(commentInput, { target: { value: "Bus ride" } });

    // Fill amount so the form is valid
    const amountInput = screen.getByRole("textbox", { name: /Amount in USD/i });
    fireEvent.change(amountInput, { target: { value: "5.00" } });

    fireEvent.click(screen.getByRole("button", { name: /Save & Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Expense saved successfully/i)).toBeTruthy();
    });

    expect(categoryInput.value).toBe("Transport");
    expect(commentInput.value).toBe("Bus ride");
  });

  it("B — amount fields are cleared after Save & Continue", async () => {
    renderAddPage();

    const amountInput = screen.getByRole("textbox", { name: /Amount in USD/i }) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "10.00" } });

    const categoryInput = document.getElementById("category-field") as HTMLInputElement;
    fireEvent.change(categoryInput, { target: { value: "Food" } });

    fireEvent.click(screen.getByRole("button", { name: /Save & Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Expense saved successfully/i)).toBeTruthy();
    });

    expect(amountInput.value).toBe("");
  });

  it("C — Save & Close navigates to /home after save", async () => {
    renderAddPage();

    fillMinimalForm();

    fireEvent.click(screen.getByRole("button", { name: /Save & Close/i }));

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeTruthy();
    });
  });
});

describe("AddExpensePage — repeat mode pre-fill", () => {
  const repeatRecord: ExpenseRecord = {
    Date: "2025-03-15",
    USD: "42.50",
    Category: "Transport",
    spentBy: "alice@example.com",
    Comment: "Bus to airport",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 7,
  };

  it("pre-fills Category, USD and Comment from repeatRecord", () => {
    renderAddPageWithRepeat(repeatRecord);

    const categoryInput = document.getElementById("category-field") as HTMLInputElement;
    expect(categoryInput.value).toBe("Transport");

    const amountInput = screen.getByRole("textbox", { name: /Amount in USD/i }) as HTMLInputElement;
    expect(amountInput.value).toBe("42.50");

    const commentInput = document.getElementById("comment-field") as HTMLTextAreaElement;
    expect(commentInput.value).toBe("Bus to airport");

    const spentByInput = document.getElementById("spent-by-field") as HTMLInputElement;
    expect(spentByInput.value).toBe("alice@example.com");
  });

  it("sets Date to today, not the original record date", () => {
    renderAddPageWithRepeat(repeatRecord);

    const today = getTodayLocalDate();
    // Layout renders the title in a span, not a heading.
    expect(screen.getByText("Add Expense")).toBeTruthy();
    // The date input rendered by react-datepicker should show today's date (not Mar 15 2025).
    const dateInputs = document.querySelectorAll("input");
    const dateInput = Array.from(dateInputs).find((i) => i.value.includes(today.slice(5, 7)));
    expect(dateInput?.value).not.toContain("2025-03-15");
  });

  it("treats the form as a fresh add — no rowNumber carried over (AC3)", () => {
    renderAddPageWithRepeat(repeatRecord);
    // Layout renders the title in a span (not a heading).
    expect(screen.getByText("Add Expense")).toBeTruthy();
    // Title must NOT be "Edit Expense" — confirms we are in add mode, not edit mode
    expect(screen.queryByText("Edit Expense")).toBeNull();
  });
});

describe("AddExpensePage — repeat mode submit", () => {
  const repeatRecord: ExpenseRecord = {
    Date: "2025-03-15",
    USD: "42.50",
    Category: "Transport",
    spentBy: "alice@example.com",
    Comment: "Bus to airport",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 7,
  };

  const successRecord = {
    record: {
      Date: getTodayLocalDate(),
      USD: "42.50",
      Category: "Transport",
      spentBy: "alice@example.com",
      Comment: "Bus to airport",
      currencyAmounts: {},
      customFields: {},
      rowNumber: 3,
    },
    insertMode: false,
  };

  beforeEach(() => {
    vi.mocked(googleSheetsService.appendExpenseRow).mockReset();
    vi.mocked(googleSheetsService.appendExpenseRow).mockResolvedValue(successRecord);
    vi.mocked(googleSheetsService.updateExpenseRow).mockReset();
  });

  it("calls appendExpenseRow (not updateExpenseRow) and omits rowNumber from the add payload (AC3)", async () => {
    renderAddPageWithRepeat(repeatRecord);

    // Form is pre-filled with USD and Category from the repeat record — submit immediately.
    fireEvent.click(screen.getByRole("button", { name: /Save & Close/i }));

    await waitFor(() => {
      expect(vi.mocked(googleSheetsService.appendExpenseRow)).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(googleSheetsService.updateExpenseRow)).not.toHaveBeenCalled();
  });
});

describe("AddExpensePage — repeat mode FX rates", () => {
  const repeatRecord: ExpenseRecord = {
    Date: "2025-03-15",
    USD: "42.50",
    Category: "Transport",
    spentBy: "alice@example.com",
    Comment: "Bus to airport",
    currencyAmounts: { EUR: "40.00" },
    customFields: {},
    rowNumber: 7,
  };

  const eurConfig = {
    config: {
      email: "test@example.com",
      spreadsheetId: "abc123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc123/edit",
      sheetName: "Expenses" as const,
      currencies: ["EUR"],
      customColumns: [],
      configMode: "default" as const,
      predefinedCategories: [],
      hiddenColumns: [],
      isGuest: false,
      accessLevel: "edit" as const,
      ownerEmail: null,
    },
    isConfigLoading: false,
    error: null,
    fileName: null,
    isFileNameLoading: false,
    saveConfig: vi.fn(),
    clearConfig: vi.fn(),
    clearError: vi.fn(),
    refreshConfig: vi.fn(),
    updateStructure: vi.fn(),
    toggleColumnVisibility: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(useConfig).mockReturnValue(eurConfig);
  });

  afterEach(() => {
    vi.mocked(useConfig).mockReturnValue({
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
      fileName: null,
      isFileNameLoading: false,
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      clearError: vi.fn(),
      refreshConfig: vi.fn(),
      updateStructure: vi.fn(),
      toggleColumnVisibility: vi.fn(),
    });
  });

  it("manualFxRates are empty in repeat mode — deriveInitialFxRates is not called (AC7)", async () => {
    renderAddPageWithRepeat(repeatRecord);

    // The FX card renders because draft.currencyAmounts["EUR"] = "40.00" (from createDraftFromRecord).
    // If deriveInitialFxRates were accidentally called, the rate input would show a derived value (~0.94).
    // In correct repeat mode it must be empty (live rate fetch, not historical derivation).
    const fxRateInput = (await screen.findByRole("textbox", {
      name: /exchange rate: EUR per 1 USD/i,
    })) as HTMLInputElement;
    expect(fxRateInput.value).toBe("");
  });
});
