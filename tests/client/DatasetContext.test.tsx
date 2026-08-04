import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatasetProvider, useDataset } from "../../app-web/contexts/DatasetContext";
import { useConfig } from "../../app-web/contexts/ConfigContext";
import { googleSheetsService } from "../../app-web/services/googleSheets";
import { ExpenseRecord, SpreadsheetConfig } from "../../app-web/types/expense";

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: () => ({ touchSession: vi.fn() }),
}));

vi.mock("../../app-web/contexts/ConfigContext", () => ({
  useConfig: vi.fn(),
}));

vi.mock("../../app-web/services/googleSheets", () => ({
  googleSheetsService: {
    loadExpenses: vi.fn(),
    loadExpenseHistory: vi.fn(),
  },
}));

function makeConfig(spreadsheetId: string): SpreadsheetConfig {
  return {
    email: "test@example.com",
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    spreadsheetId,
    sheetName: "Expenses",
    currencies: [],
    customColumns: [],
    configMode: "default",
    predefinedCategories: [],
    hiddenColumns: [],
    isGuest: false,
    accessLevel: "edit",
    ownerEmail: null,
  };
}

function makeRecord(rowNumber: number): ExpenseRecord {
  return {
    Date: "2026-01-01",
    USD: "10",
    Category: "Misc",
    spentBy: "",
    spentFor: "",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber,
  };
}

function mockConfig(config: SpreadsheetConfig | null): void {
  vi.mocked(useConfig).mockReturnValue({
    config,
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
}

function Probe(): JSX.Element {
  const { status, snapshot, loadDataset } = useDataset();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="records">{snapshot?.records.length ?? "none"}</span>
      <button onClick={() => void loadDataset()}>load</button>
    </div>
  );
}

describe("DatasetProvider — spreadsheet switch", () => {
  beforeEach(() => {
    vi.mocked(googleSheetsService.loadExpenses).mockReset();
    vi.mocked(googleSheetsService.loadExpenseHistory).mockReset();
  });

  it("discards the stale snapshot and resets to idle when config.spreadsheetId changes", async () => {
    vi.mocked(googleSheetsService.loadExpenses).mockResolvedValueOnce({
      records: [makeRecord(1)],
      payloadBytes: 10,
      sheetCurrencies: [],
      customColumns: [],
      loadPhase: "full",
      startRow: 2,
      totalRows: 1,
    });
    mockConfig(makeConfig("sheet-a"));

    const user = userEvent.setup();
    const { rerender } = render(
      <DatasetProvider>
        <Probe />
      </DatasetProvider>,
    );

    await user.click(screen.getByText("load"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("records").textContent).toBe("1");

    // Setup switches to a different linked sheet — provider survives navigation since it wraps the router.
    mockConfig(makeConfig("sheet-b"));
    rerender(
      <DatasetProvider>
        <Probe />
      </DatasetProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("idle"));
    expect(screen.getByTestId("records").textContent).toBe("none");
  });

  it("does not reset when the config object changes without the spreadsheetId changing", async () => {
    vi.mocked(googleSheetsService.loadExpenses).mockResolvedValueOnce({
      records: [makeRecord(1)],
      payloadBytes: 10,
      sheetCurrencies: [],
      customColumns: [],
      loadPhase: "full",
      startRow: 2,
      totalRows: 1,
    });
    mockConfig(makeConfig("sheet-a"));

    const user = userEvent.setup();
    const { rerender } = render(
      <DatasetProvider>
        <Probe />
      </DatasetProvider>,
    );

    await user.click(screen.getByText("load"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));

    // Same spreadsheetId, different object identity (e.g. custom columns changed) — no reset expected.
    mockConfig({ ...makeConfig("sheet-a"), customColumns: ["Notes"] });
    rerender(
      <DatasetProvider>
        <Probe />
      </DatasetProvider>,
    );

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("records").textContent).toBe("1");
  });
});
