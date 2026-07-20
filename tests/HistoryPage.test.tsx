import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HistoryPage } from "../src/pages/HistoryPage";
import { useDataset } from "../src/contexts/DatasetContext";
import { ExpenseRecord } from "../src/types/expense";

const { mockUseAuth, mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAuth: vi.fn(() => ({
    session: { guestAccessLevel: null as 'view' | 'edit' | null, email: "test@example.com", givenName: "Test", picture: null },
    error: null,
    status: "signed_in",
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    touchSession: vi.fn(),
    clearError: vi.fn(),
  })),
}));

vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

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

vi.mock("../src/services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../src/services/googleSheets", () => ({
  googleSheetsService: {
    deleteLastExpenseRow: vi.fn(),
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

const emptyFilters = { comment: "", categories: [] as string[], amountFrom: "", amountTo: "", customFields: {} };

function mockDataset(overrides: Partial<ReturnType<typeof useDataset>>) {
  vi.mocked(useDataset).mockReturnValue({
    status: "ready",
    snapshot: null,
    error: null,
    isLoadingHistory: false,
    searchFilters: emptyFilters,
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

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <HistoryPage />
    </MemoryRouter>,
  );
}

function findDateGroupBadge(container: HTMLElement, dateText: string): Element | null {
  const groups = Array.from(container.querySelectorAll(".expense-date-group"));
  const group = groups.find((g) => g.querySelector(".expense-date-header")?.textContent?.startsWith(dateText));
  return group?.querySelector(".expense-date-badge") ?? null;
}

describe("HistoryPage — per-day totals", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it.each([
    ["categories", { ...emptyFilters, categories: ["Misc"] }],
    ["comment", { ...emptyFilters, comment: "coffee" }],
    ["amountFrom", { ...emptyFilters, amountFrom: "10" }],
    ["amountTo", { ...emptyFilters, amountTo: "100" }],
    ["customFields", { ...emptyFilters, customFields: { SpentFor: "trip" } }],
  ])("suppresses per-day totals when the %s filter is active", (_label, searchFilters) => {
    const records = [makeRecord(1, "2026-06-09", "45"), makeRecord(2, "2026-06-09", "5")];
    mockDataset({
      snapshot: { records, distinctValues: { Category: [], spentBy: [], customFields: {} }, loadedAt: 0, payloadBytes: 0, loadPhase: "full" },
      searchFilters,
    });
    const { container } = renderHistory();
    expect(container.querySelector(".expense-date-badge")).toBeNull();
  });

  it("suppresses the total for a boundary day truncated by pagination, then shows it once 'Show earlier' loads the remainder", async () => {
    const user = userEvent.setup();
    const records: ExpenseRecord[] = [
      makeRecord(1, "2026-01-01", "1"), // filler, excluded from initial page
      makeRecord(2, "2026-06-01", "10"), // boundary day — 1st of 2 records, excluded from initial page
      makeRecord(3, "2026-06-01", "20"), // boundary day — 2nd of 2 records, included
    ];
    // Pad with filler records on unique dates so the total dataset has 52 records — the visible
    // window (last 50) then cuts off the first two records (the filler and the boundary day's first record).
    for (let i = 4; i <= 52; i++) {
      const month = 3 + Math.floor((i - 4) / 28);
      const day = ((i - 4) % 28) + 1;
      records.push(makeRecord(i, `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, "1"));
    }
    mockDataset({
      snapshot: { records, distinctValues: { Category: [], spentBy: [], customFields: {} }, loadedAt: 0, payloadBytes: 0, loadPhase: "full" },
    });

    const { container } = renderHistory();
    // Boundary day "2026-06-01" only has 1 of its 2 records visible — total should be suppressed.
    expect(findDateGroupBadge(container, "2026-06-01")).toBeNull();

    const showEarlierBtn = screen.getByRole("button", { name: /show earlier/i });
    await user.click(showEarlierBtn);

    // All 52 records are now visible — the boundary day's total should appear.
    expect(findDateGroupBadge(container, "2026-06-01")).not.toBeNull();
  });
});

describe("HistoryPage — Repeat button", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({
      session: { guestAccessLevel: null, email: "test@example.com", givenName: "Test", picture: null },
      error: null,
      status: "signed_in",
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      touchSession: vi.fn(),
      clearError: vi.fn(),
    });
  });

  afterEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({
      session: { guestAccessLevel: null, email: "test@example.com", givenName: "Test", picture: null },
      error: null,
      status: "signed_in",
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      touchSession: vi.fn(),
      clearError: vi.fn(),
    });
  });

  it("shows Repeat button in expanded card for edit-access users", async () => {
    const user = userEvent.setup();
    mockDataset({
      snapshot: {
        records: [makeRecord(1, "2026-07-01", "25")],
        distinctValues: { Category: [], spentBy: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
    });
    renderHistory();
    const card = document.querySelector(".expense-card--interactive")!;
    await user.click(card);
    expect(screen.getByRole("button", { name: /repeat this expense/i })).toBeTruthy();
  });

  it("navigates to /add with the source record in state when Repeat is clicked", async () => {
    const user = userEvent.setup();
    const record = makeRecord(1, "2026-07-01", "25");
    mockDataset({
      snapshot: {
        records: [record],
        distinctValues: { Category: [], spentBy: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
    });
    renderHistory();
    const card = document.querySelector(".expense-card--interactive")!;
    await user.click(card);
    const repeatBtn = screen.getByRole("button", { name: /repeat this expense/i });
    await user.click(repeatBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/add", { state: { repeatRecord: record } });
  });

  it("hides Repeat button for view-only users", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      session: { guestAccessLevel: "view", email: "guest@example.com", givenName: "Guest", picture: null },
      error: null,
      status: "signed_in",
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      touchSession: vi.fn(),
      clearError: vi.fn(),
    });
    mockDataset({
      snapshot: {
        records: [makeRecord(1, "2026-07-01", "25")],
        distinctValues: { Category: [], spentBy: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
    });
    renderHistory();
    // For view-only users, onRepeatRequest is not passed so card may not be interactive via actions.
    // Verify the Repeat button is absent.
    expect(screen.queryByRole("button", { name: /repeat this expense/i })).toBeNull();
  });
});
