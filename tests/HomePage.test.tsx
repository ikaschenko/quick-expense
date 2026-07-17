import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../src/pages/HomePage";
import { useDataset } from "../src/contexts/DatasetContext";
import { ExpenseRecord } from "../src/types/expense";

vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { guestAccessLevel: null, email: "test@example.com", givenName: "Test", picture: null },
    error: null,
    status: "signed_in",
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    touchSession: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("../src/contexts/ConfigContext", () => ({
  useConfig: () => ({
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
  }),
}));

vi.mock("../src/contexts/DatasetContext", () => ({
  useDataset: vi.fn(),
}));

vi.mock("../src/services/googleSheets", () => ({
  googleSheetsService: {
    getSheetModifiedTime: vi.fn().mockResolvedValue({ modifiedTime: null }),
  },
}));

function makeRecord(rowNumber: number, date: string, usd: string): ExpenseRecord {
  return {
    Date: date,
    USD: usd,
    Category: "Misc",
    spentBy: "test",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber,
  };
}

function mockDataset(overrides: Partial<ReturnType<typeof useDataset>>) {
  vi.mocked(useDataset).mockReturnValue({
    status: "ready",
    snapshot: {
      // Date far outside any current period — keeps every widget in its empty state,
      // while satisfying the "has records" check that renders the dashboard.
      records: [makeRecord(1, "2000-01-01", "10")],
      distinctValues: { Category: [], spentBy: [], customFields: {} },
      loadedAt: 0,
      payloadBytes: 0,
      loadPhase: "full",
    },
    error: null,
    isLoadingHistory: false,
    searchFilters: { comment: "", categories: [], amountFrom: "", amountTo: "", customFields: {} },
    setSearchFilters: vi.fn(),
    loadDataset: vi.fn(),
    reloadDataset: vi.fn(),
    invalidateDataset: vi.fn(),
    appendToDataset: vi.fn(),
    updateInDataset: vi.fn(),
    removeLastFromDataset: vi.fn(),
    clearError: vi.fn(),
    distinctValues: { Category: [], spentBy: [], customFields: {} },
    ...overrides,
  });
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage — widget info tooltips", () => {
  it("renders an info icon for each of the 4 dashboard widgets", () => {
    mockDataset({});
    renderHome();
    expect(screen.getAllByRole("button", { name: /Show info about/i })).toHaveLength(4);
  });

  it("toggles the TODAY popover open and closed with the exact copy, without affecting other widgets", async () => {
    const user = userEvent.setup();
    mockDataset({});
    renderHome();

    const todayButton = screen.getByRole("button", { name: "Show info about TODAY" });
    expect(screen.queryByText("Total amount of expenses for today.")).toBeNull();

    await user.click(todayButton);
    expect(screen.getByText("Total amount of expenses for today.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide info about TODAY" }).getAttribute("aria-expanded")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Hide info about TODAY" }));
    expect(screen.queryByText("Total amount of expenses for today.")).toBeNull();
  });

  it("shows the exact copy for each widget", async () => {
    const user = userEvent.setup();
    mockDataset({});
    renderHome();

    await user.click(screen.getByRole("button", { name: /Show info about [A-Z]+ SO FAR$/ }));
    expect(
      screen.getByText(
        "Total amount of expenses for the ongoing month, compared to the same date range for the previous month (shown only when comparable prior-month data exists).",
      ),
    ).toBeTruthy();

    const year = new Date().getFullYear();
    await user.click(screen.getByRole("button", { name: `Show info about ${year} SO FAR` }));
    expect(
      screen.getByText(
        "Total amount of expenses for the ongoing year, compared to the same date range for the previous year (if enough data). The forecast projects your full-year total from your recent daily spending rate.",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show info about ROLLING 12M EXPENSES" }));
    expect(
      screen.getByText(
        "Total amount of expenses over the trailing 12 months (up to yesterday), compared to the preceding 12-month period (shown when that data exists).",
      ),
    ).toBeTruthy();
  });

  it("toggles each widget's popover independently — opening one does not close another", async () => {
    const user = userEvent.setup();
    mockDataset({});
    renderHome();

    await user.click(screen.getByRole("button", { name: "Show info about TODAY" }));
    await user.click(screen.getByRole("button", { name: "Show info about ROLLING 12M EXPENSES" }));

    expect(screen.getByText("Total amount of expenses for today.")).toBeTruthy();
    expect(
      screen.getByText(
        "Total amount of expenses over the trailing 12 months (up to yesterday), compared to the preceding 12-month period (shown when that data exists).",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Hide info about TODAY" }));
    expect(screen.queryByText("Total amount of expenses for today.")).toBeNull();
    expect(
      screen.getByText(
        "Total amount of expenses over the trailing 12 months (up to yesterday), compared to the preceding 12-month period (shown when that data exists).",
      ),
    ).toBeTruthy();
  });
});
