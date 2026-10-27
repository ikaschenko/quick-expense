import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectedSheetCard } from "../../app-web/components/ConnectedSheetCard";
import type { SpreadsheetConfig } from "../../app-web/types/expense";

const configFixture = vi.hoisted(() => ({
  fileName: "My Sheet" as string | null,
  isFileNameLoading: false,
}));

vi.mock("../../app-web/contexts/ConfigContext", () => ({
  useConfig: () => ({
    clearConfig: vi.fn(),
    fileName: configFixture.fileName,
    isFileNameLoading: configFixture.isFileNameLoading,
  }),
}));

function makeConfig(overrides: Partial<SpreadsheetConfig> = {}): SpreadsheetConfig {
  return {
    spreadsheetId: "sheet123",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet123",
    currencies: [],
    customColumns: [],
    hiddenColumns: [],
    isGuest: false,
    accessLevel: "edit",
    ownerEmail: "owner@example.com",
    configMode: "default",
    ...overrides,
  } as SpreadsheetConfig;
}

function renderCard(config: SpreadsheetConfig, onFixConfig = vi.fn()) {
  return render(<ConnectedSheetCard config={config} onChangeSheet={vi.fn()} onFixConfig={onFixConfig} />);
}

describe("ConnectedSheetCard", () => {
  beforeEach(() => {
    configFixture.fileName = "My Sheet";
    configFixture.isFileNameLoading = false;
  });

  it("renders the file name as a link next to the File label", () => {
    renderCard(makeConfig());
    expect(screen.getByText("File:")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My Sheet" }).getAttribute("href")).toBe(
      "https://docs.google.com/spreadsheets/d/sheet123",
    );
  });

  it("falls back to the URL when the file name is unavailable", () => {
    configFixture.fileName = null;
    renderCard(makeConfig());
    expect(screen.getByRole("link", { name: "https://docs.google.com/spreadsheets/d/sheet123" })).toBeTruthy();
  });

  it("shows a skeleton while the file name is loading", () => {
    configFixture.isFileNameLoading = true;
    renderCard(makeConfig());
    expect(screen.getByLabelText("Loading file name…")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    ["config-driven", "custom columns"],
    ["config-no-mapping", "custom columns"],
    ["default", "default"],
    ["config-invalid", "default"],
  ] as const)("shows Configuration: %s as '%s'", (configMode, value) => {
    renderCard(makeConfig({ configMode }));
    expect(screen.getByText("Configuration:")).toBeTruthy();
    expect(screen.getByText(value)).toBeTruthy();
  });

  it("renders Change and Unlink in the header row for the owner", () => {
    renderCard(makeConfig());
    const header = screen.getByText("Connected").parentElement as HTMLElement;
    expect(header.contains(screen.getByRole("button", { name: /Change/ }))).toBe(true);
    expect(header.contains(screen.getByRole("button", { name: /Unlink/ }))).toBe(true);
  });

  it("hides Change and Unlink for guests", () => {
    renderCard(makeConfig({ isGuest: true }));
    expect(screen.queryByRole("button", { name: /Change/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Unlink/ })).toBeNull();
  });

  it("shows the Fix it hint only for config-invalid and calls onFixConfig", () => {
    const onFixConfig = vi.fn();
    const { unmount } = renderCard(makeConfig({ configMode: "config-invalid" }), onFixConfig);
    fireEvent.click(screen.getByRole("button", { name: /Fix it/ }));
    expect(onFixConfig).toHaveBeenCalledOnce();
    unmount();

    renderCard(makeConfig({ configMode: "default" }));
    expect(screen.queryByRole("button", { name: /Fix it/ })).toBeNull();
  });
});
