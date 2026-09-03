import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { HomePage } from "../../app-web/pages/HomePage";
import { useDataset } from "../../app-web/contexts/DatasetContext";
import { ExpenseRecord } from "../../app-web/types/expense";
import { formatLocalDate } from "../../app-web/utils/date";
import { metricsCache } from "../../app-web/services/metricsCache";
import { googleSheetsService } from "../../app-web/services/googleSheets";

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
    spentFor: "test",
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
      distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
      loadedAt: 0,
      payloadBytes: 0,
      loadPhase: "full",
    },
    error: null,
    isLoadingHistory: false,
    searchFilters: { comment: "", categories: [], amountFrom: "", amountTo: "", spentBy: "", spentFor: "", customFields: {} },
    setSearchFilters: vi.fn(),
    loadDataset: vi.fn(),
    reloadDataset: vi.fn(),
    invalidateDataset: vi.fn(),
    appendToDataset: vi.fn(),
    updateInDataset: vi.fn(),
    removeLastFromDataset: vi.fn(),
    clearError: vi.fn(),
    distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
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
        distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
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
        distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
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

describe("HomePage — Month details expand", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not force a reload when live data is already ready", async () => {
    const user = userEvent.setup();
    const loadDataset = vi.fn();
    const today = formatLocalDate(new Date());
    mockDataset({
      loadDataset,
      snapshot: {
        records: [makeRecord(1, today, "25")],
        distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
    });
    renderHome();

    await user.click(screen.getByRole("button", { name: /Month details/i }));
    expect(loadDataset).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("forces a dataset reload and shows a spinner when expanded while only a cached snapshot is rendered", async () => {
    const user = userEvent.setup();
    const loadDataset = vi.fn().mockResolvedValue(undefined);
    const today = formatLocalDate(new Date());
    const sheetLastModifiedTime = "2026-01-01T00:00:00.000Z";

    metricsCache.save("test@example.com", {
      cacheDate: today,
      spreadsheetId: "abc123",
      sheetLastModifiedTime,
      todayStats: { count: 1, usdTotal: 25, dualCurrency: null },
      mtdStats: { count: 1, usdTotal: 25, deviation: null },
      ytdStats: { count: 1, usdTotal: 25, deviation: null },
      ytdForecast: { amountUsd: 300, deviation: null },
      rolling12mStats: { count: 1, usdTotal: 25, deviation: null },
      mtdDailyAmounts: [25],
      weekBoundaryPositions: [],
    });
    // Cache is fresh (matches Drive's modified time) — the background staleness check must
    // not itself trigger a reload here so the assertion isolates the new expand-triggered load.
    vi.mocked(googleSheetsService.getSheetModifiedTime).mockResolvedValueOnce({ modifiedTime: sheetLastModifiedTime });

    mockDataset({ status: "idle", snapshot: null, loadDataset });
    renderHome();

    await waitFor(() => expect(screen.getByRole("button", { name: /Month details/i })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Month details/i }));

    expect(loadDataset).toHaveBeenCalled();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

describe("HomePage — month navigation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts on the current month and disables navigation into the future", () => {
    const today = formatLocalDate(new Date());
    mockDataset({ snapshot: {
      records: [makeRecord(1, today, "25")],
      distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
      loadedAt: 0,
      payloadBytes: 0,
      loadPhase: "full",
    } });
    renderHome();

    expect(screen.getByText(`${new Date().toLocaleString("en", { month: "long" }).toUpperCase()} SO FAR`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);
  });

  it("navigates to the previous month and back without changing other widgets", async () => {
    const user = userEvent.setup();
    const today = formatLocalDate(new Date());
    const previous = new Date();
    previous.setMonth(previous.getMonth() - 1, 15);
    const previousDate = formatLocalDate(previous);
    mockDataset({ snapshot: {
      records: [makeRecord(1, today, "25"), makeRecord(2, previousDate, "40")],
      distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
      loadedAt: 0,
      payloadBytes: 0,
      loadPhase: "full",
    } });
    renderHome();

    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(screen.getByText(`${previous.toLocaleString("en", { month: "long" }).toUpperCase()} TOTAL`)).toBeTruthy();
    expect(screen.getAllByText("$40").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", false);
    const todayCard = Array.from(document.querySelectorAll(".home-metric-card"))
      .find((card) => card.textContent?.includes("TODAY"));
    expect(todayCard?.textContent).toContain("25");

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText(`${new Date().toLocaleString("en", { month: "long" }).toUpperCase()} SO FAR`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);
  });

  it("loads live records when navigating from a fresh cache with details collapsed", async () => {
    const user = userEvent.setup();
    const today = formatLocalDate(new Date());
    const previous = new Date();
    previous.setMonth(previous.getMonth() - 1, 15);
    const previousDate = formatLocalDate(previous);
    const loadDataset = vi.fn().mockResolvedValue(undefined);

    metricsCache.save("test@example.com", {
      cacheDate: today,
      spreadsheetId: "abc123",
      sheetLastModifiedTime: "2026-01-01T00:00:00.000Z",
      todayStats: { count: 1, usdTotal: 25, dualCurrency: null },
      mtdStats: { count: 1, usdTotal: 25, deviation: null },
      ytdStats: { count: 1, usdTotal: 25, deviation: null },
      ytdForecast: { amountUsd: 300, deviation: null },
      rolling12mStats: { count: 1, usdTotal: 25, deviation: null },
      mtdDailyAmounts: [25],
      weekBoundaryPositions: [],
    });
    vi.mocked(googleSheetsService.getSheetModifiedTime).mockResolvedValueOnce({
      modifiedTime: "2026-01-01T00:00:00.000Z",
    });
    mockDataset({ status: "idle", snapshot: null, loadDataset });
    const { rerender } = renderHome();

    await waitFor(() => expect(screen.getByRole("button", { name: "Previous month" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(loadDataset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Updating…")).toBeTruthy();

    mockDataset({
      status: "ready",
      snapshot: {
        records: [makeRecord(1, today, "25"), makeRecord(2, previousDate, "40")],
        distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
      loadDataset,
    });
    rerender(
      <MemoryRouter initialEntries={["/home"]}>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText(`${previous.toLocaleString("en", { month: "long" }).toUpperCase()} TOTAL`)).toBeTruthy();
    expect(screen.getAllByText("$40").length).toBeGreaterThan(0);
  });
});

describe("HomePage — stale cached metrics", () => {
  const EMAIL = "test@example.com";
  const CACHED_MTD_TOTAL = 200;

  function saveEntry(cacheDate: string) {
    metricsCache.save(EMAIL, {
      cacheDate,
      spreadsheetId: "abc123",
      sheetLastModifiedTime: "2026-06-14T10:00:00.000Z",
      todayStats: { count: 3, usdTotal: 42, dualCurrency: null },
      mtdStats: { count: 7, usdTotal: CACHED_MTD_TOTAL, deviation: null },
      ytdStats: { count: 20, usdTotal: 800, deviation: null },
      ytdForecast: { amountUsd: 1500, deviation: null },
      rolling12mStats: { count: 100, usdTotal: 4000, deviation: null },
      mtdDailyAmounts: [10, 20, 30],
      weekBoundaryPositions: [6, 13],
    });
  }

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(googleSheetsService.getSheetModifiedTime).mockClear();
    vi.setSystemTime(new Date(2026, 5, 15, 12)); // 2026-06-15
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a previous-day cache instantly, blanks TODAY and refreshes without a Drive check", async () => {
    const loadDataset = vi.fn().mockResolvedValue(undefined);
    saveEntry("2026-06-14");
    mockDataset({ status: "idle", snapshot: null, loadDataset });

    const { container } = renderHome();

    await waitFor(() => expect(container.querySelector(".home-dashboard")).not.toBeNull());
    expect(screen.queryByText("Loading expenses from Google Sheet…")).toBeNull();
    expect(screen.getByText("Updating… · as of Jun 14")).toBeTruthy();
    expect(container.querySelector(".home-dashboard--stale")).not.toBeNull();

    const amounts = Array.from(container.querySelectorAll(".home-metric-amount")).map((el) => el.textContent);
    expect(amounts).toContain("$200.00"); // MTD still comes from cache — same month
    expect(amounts).not.toContain("$42.00"); // TODAY is suppressed
    expect(container.querySelectorAll(".home-metric-refreshing")).toHaveLength(1);

    expect(loadDataset).toHaveBeenCalledTimes(1);
    expect(googleSheetsService.getSheetModifiedTime).not.toHaveBeenCalled();
  });

  it("blanks both TODAY and MTD (including the chart) when the cache is from a previous month", async () => {
    const loadDataset = vi.fn().mockResolvedValue(undefined);
    saveEntry("2026-05-31");
    mockDataset({ status: "idle", snapshot: null, loadDataset });

    const { container } = renderHome();

    await waitFor(() => expect(container.querySelector(".home-dashboard")).not.toBeNull());
    expect(container.querySelectorAll(".home-metric-refreshing")).toHaveLength(2);
    expect(container.querySelector(".home-chart-container")).toBeNull();
    expect(screen.queryByRole("button", { name: /Month details/i })).toBeNull();

    const amounts = Array.from(container.querySelectorAll(".home-metric-amount")).map((el) => el.textContent);
    expect(amounts).not.toContain("$200.00");
    expect(amounts).toContain("$800.00"); // YTD is still meaningful
  });

  it("drops the stale affordances once live data is ready", async () => {
    const loadDataset = vi.fn().mockResolvedValue(undefined);
    saveEntry("2026-06-14");
    mockDataset({ status: "idle", snapshot: null, loadDataset });

    const { container, rerender } = renderHome();
    await waitFor(() => expect(screen.getByText("Updating… · as of Jun 14")).toBeTruthy());

    mockDataset({
      snapshot: {
        records: [makeRecord(1, "2026-06-15", "25")],
        distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
        loadedAt: 0,
        payloadBytes: 0,
        loadPhase: "full",
      },
      loadDataset,
    });
    rerender(
      <MemoryRouter initialEntries={["/home"]}>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText("Updating… · as of Jun 14")).toBeNull());
    expect(container.querySelector(".home-dashboard--stale")).toBeNull();
    expect(container.querySelectorAll(".home-metric-refreshing")).toHaveLength(0);
    const amounts = Array.from(container.querySelectorAll(".home-metric-amount")).map((el) => el.textContent);
    expect(amounts).toContain("$25.00"); // live TODAY value
  });

  it("still validates a same-day cache against Drive and reloads when modifiedTime is unavailable (guest)", async () => {
    const loadDataset = vi.fn().mockResolvedValue(undefined);
    saveEntry("2026-06-15");
    vi.mocked(googleSheetsService.getSheetModifiedTime).mockResolvedValueOnce({ modifiedTime: null });
    mockDataset({ status: "idle", snapshot: null, loadDataset });

    const { container } = renderHome();

    await waitFor(() => expect(googleSheetsService.getSheetModifiedTime).toHaveBeenCalled());
    await waitFor(() => expect(loadDataset).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".home-dashboard--stale")).toBeNull();
    expect(screen.queryByText(/Updating… · as of/)).toBeNull();
  });

  it("shows the skeleton and loads immediately when no cache exists", async () => {
    const loadDataset = vi.fn().mockResolvedValue(undefined);
    mockDataset({ status: "idle", snapshot: null, loadDataset });

    renderHome();

    expect(screen.getByText("Loading expenses from Google Sheet…")).toBeTruthy();
    await waitFor(() => expect(loadDataset).toHaveBeenCalledTimes(1));
  });
});
