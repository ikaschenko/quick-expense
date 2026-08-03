import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { HomePage } from "../../app-web/pages/HomePage";
import { useDataset } from "../../app-web/contexts/DatasetContext";
import { ExpenseRecord } from "../../app-web/types/expense";
import { formatLocalDate } from "../../app-web/utils/date";

vi.mock("../../app-web/contexts/AuthContext", () => ({
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

vi.mock("../../app-web/contexts/ConfigContext", () => ({
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

vi.mock("../../app-web/contexts/DatasetContext", () => ({
  useDataset: vi.fn(),
}));

vi.mock("../../app-web/services/googleSheets", () => ({
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

function LocationStateProbe(): JSX.Element {
  const location = useLocation();
  return <span data-testid="location-state">{JSON.stringify(location.state)}</span>;
}

describe("HomePage — saved banner", () => {
  it("shows the banner once, then clears the history state so a reload won't re-show it", async () => {
    mockDataset({});
    render(
      <MemoryRouter initialEntries={[{ pathname: "/home", state: { expenseSaved: true } }]}>
        <HomePage />
        <LocationStateProbe />
      </MemoryRouter>,
    );

    expect(screen.getByText("Expense saved successfully.")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("location-state").textContent).toBe("null"));
  });

  it("does not show the banner on a plain navigation without expenseSaved state", () => {
    mockDataset({});
    renderHome();
    expect(screen.queryByText("Expense saved successfully.")).toBeNull();
  });
});

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

    await user.click(screen.getByRole("button", { name: "Show info about YEARLY VIEW" }));
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

  it("starts every widget's help button collapsed (aria-expanded=false)", () => {
    mockDataset({});
    renderHome();

    const buttons = screen.getAllByRole("button", { name: /^Show info about/ });
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("reuses the existing .section-help-btn / .section-help-popover CSS classes rather than introducing new ones", async () => {
    const user = userEvent.setup();
    mockDataset({});
    const { container } = renderHome();

    expect(container.querySelectorAll(".section-help-btn")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Show info about TODAY" }));
    const popover = container.querySelector(".section-help-popover");
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toBe("Total amount of expenses for today.");
  });

  it("toggles the popover via keyboard activation (Enter), matching native button semantics", async () => {
    const user = userEvent.setup();
    mockDataset({});
    renderHome();

    const todayButton = screen.getByRole("button", { name: "Show info about TODAY" });
    todayButton.focus();
    expect(document.activeElement).toBe(todayButton);

    await user.keyboard("{Enter}");
    expect(screen.getByText("Total amount of expenses for today.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide info about TODAY" }));

    await user.keyboard("{Enter}");
    expect(screen.queryByText("Total amount of expenses for today.")).toBeNull();
  });

  it("leaves the ROLLING 12M EXPENSES on-screen title text unchanged", () => {
    mockDataset({});
    const { container } = renderHome();

    const title = Array.from(container.querySelectorAll(".home-metric-title")).find((el) =>
      el.textContent?.startsWith("ROLLING 12M EXPENSES"),
    );
    expect(title).toBeTruthy();
    // The title text node itself (excluding the button's accessible label) is unchanged.
    expect(title?.firstChild?.textContent?.trim()).toBe("ROLLING 12M EXPENSES");
  });

  it("does not render a separate help icon for the YTD forecast column — it is folded into the merged YEARLY VIEW widget tooltip", () => {
    const today = formatLocalDate(new Date());
    mockDataset({
      snapshot: {
        records: [makeRecord(1, today, "25")],
        distinctValues: { Category: [], spentBy: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
    });
    const { container } = renderHome();

    // YTD now has data, so the Full year FORECAST column renders alongside the YTD amount.
    expect(screen.getByText("Full year FORECAST")).toBeTruthy();

    const yearlyCard = Array.from(container.querySelectorAll(".home-metric-card")).find((el) =>
      el.textContent?.includes("YEARLY VIEW") && el.textContent?.includes("Full year FORECAST"),
    );
    expect(yearlyCard).toBeTruthy();
    expect(yearlyCard?.querySelectorAll(".section-help-btn")).toHaveLength(1);
  });

  it("shows a muted 'No data' line in the forecast slot when the forecast is computable but the prior year has no data", () => {
    mockDataset({
      snapshot: {
        // 3 distinct current-year days → forecast is computable; no 2025 records at all.
        records: [
          makeRecord(1, "2026-01-01", "100"),
          makeRecord(2, "2026-01-02", "100"),
          makeRecord(3, "2026-01-03", "100"),
        ],
        distinctValues: { Category: [], spentBy: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
    });
    const { container } = renderHome();

    const yearlyCard = Array.from(container.querySelectorAll(".home-metric-card")).find((el) =>
      el.textContent?.includes("YEARLY VIEW"),
    );
    expect(yearlyCard).toBeTruthy();
    // Forecast amount still renders (not the "Not enough data" empty state)...
    expect(yearlyCard?.querySelector(".home-metric-amount")).not.toBeNull();
    // ...but the deviation slot falls back to a muted "No data" line instead of a DeviationLine.
    const noDataLine = yearlyCard?.querySelector(".home-metric-forecast");
    expect(noDataLine?.textContent).toBe("No data");
    expect(yearlyCard?.querySelector(".prior-period-label")).toBeNull();
  });

  it("renders ROLLING 12M EXPENSES as its own standalone card, not sharing a row with YEARLY VIEW", () => {
    mockDataset({});
    const { container } = renderHome();

    // The old two-column .home-metric-row wrapper is gone from the live dashboard
    // (it only remains in the loading skeleton) — Rolling 12M is a direct sibling card.
    expect(container.querySelector(".home-dashboard > .home-metric-row")).toBeNull();

    const rollingCard = Array.from(container.querySelectorAll(".home-metric-card")).find((el) =>
      el.textContent?.includes("ROLLING 12M EXPENSES"),
    );
    expect(rollingCard?.parentElement?.className).toBe("home-dashboard");
  });
});
