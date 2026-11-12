import { act, renderHook } from "@testing-library/react";
import { useSpreadsheetSetup } from "../../app-web/hooks/useSpreadsheetSetup";
import { googleSheetsService } from "../../app-web/services/googleSheets";
import { openSpreadsheetPicker } from "../../app-web/services/googlePicker";
import { trackEvent } from "../../app-web/services/analytics";
import { AppError, type SpreadsheetConfig } from "../../app-web/types/expense";

const saveConfig = vi.hoisted(() => vi.fn());
vi.mock("../../app-web/contexts/ConfigContext", () => ({ useConfig: () => ({ saveConfig }) }));
vi.mock("../../app-web/services/googleSheets", () => ({ googleSheetsService: {
  saveConfig: vi.fn(), createSpreadsheet: vi.fn(), getPickerConfig: vi.fn(),
} }));
vi.mock("../../app-web/services/googlePicker", () => ({ openSpreadsheetPicker: vi.fn() }));
vi.mock("../../app-web/services/analytics", () => ({ trackEvent: vi.fn() }));

const config: SpreadsheetConfig = {
  email: "user@example.com", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet123/edit",
  spreadsheetId: "sheet123", sheetName: "Expenses", currencies: [], customColumns: [],
  configMode: "default", predefinedCategories: [], hiddenColumns: [],
  isGuest: false, accessLevel: "edit", ownerEmail: null,
};
const response = { config, setupReport: { tabAction: "found", headersAction: "valid" } as const };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(googleSheetsService.saveConfig).mockResolvedValue(response);
  vi.mocked(googleSheetsService.createSpreadsheet).mockResolvedValue(response);
  vi.mocked(googleSheetsService.getPickerConfig).mockResolvedValue({ accessToken: "secret", apiKey: "key", appId: "app" });
  vi.mocked(openSpreadsheetPicker).mockResolvedValue({ spreadsheetId: config.spreadsheetId, spreadsheetUrl: config.spreadsheetUrl, name: "Private sheet" });
});

describe("useSpreadsheetSetup", () => {
  it("emits no onboarding events on mount or banner reset", () => {
    const { result } = renderHook(() => useSpreadsheetSetup());
    act(() => result.current.resetBanners());
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("records a completed new-sheet setup only after the server confirms it", async () => {
    let finish!: (value: typeof response) => void;
    vi.mocked(googleSheetsService.createSpreadsheet).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useSpreadsheetSetup());
    let pending!: Promise<void>;
    act(() => { pending = result.current.onCreateSpreadsheet(); });
    expect(result.current.isCreating).toBe(true);
    expect(trackEvent).not.toHaveBeenCalled();
    await act(async () => { finish(response); await pending; });
    expect(saveConfig).toHaveBeenCalledWith(config);
    expect(trackEvent).toHaveBeenCalledWith("setup_created");
    expect(trackEvent).toHaveBeenCalledWith("setup_completed", { method: "new_sheet" });
    expect(result.current.isCreating).toBe(false);
  });

  it("records successful existing-sheet connections and successful mapping retries", async () => {
    const { result } = renderHook(() => useSpreadsheetSetup());
    await act(async () => result.current.onPickFromDrive());
    expect(googleSheetsService.saveConfig).toHaveBeenCalledWith(config.spreadsheetUrl);
    expect(trackEvent).toHaveBeenCalledWith("setup_saved");
    expect(trackEvent).toHaveBeenCalledWith("setup_completed", { method: "existing_sheet" });
    vi.mocked(trackEvent).mockClear();
    await act(async () => result.current.resaveCurrentSpreadsheet());
    expect(trackEvent).toHaveBeenCalledWith("setup_completed", { method: "existing_sheet" });
  });

  it("does not treat picker cancellation as failure or completion", async () => {
    vi.mocked(openSpreadsheetPicker).mockResolvedValue(null);
    const { result } = renderHook(() => useSpreadsheetSetup());
    await act(async () => result.current.onPickFromDrive());
    expect(trackEvent).not.toHaveBeenCalled();
    expect(googleSheetsService.saveConfig).not.toHaveBeenCalled();
    expect(result.current.isPicking).toBe(false);
  });

  it.each(["config", "picker"])("classifies %s failures without sending private messages", async (stage) => {
    const error = new AppError("authentication", "secret token and private sheet URL");
    if (stage === "config") vi.mocked(googleSheetsService.getPickerConfig).mockRejectedValue(error);
    else vi.mocked(openSpreadsheetPicker).mockRejectedValue(error);
    const { result } = renderHook(() => useSpreadsheetSetup());
    await act(async () => result.current.onPickFromDrive());
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("setup_failed", { method: "existing_sheet", stage: "picker", error_kind: "authentication" });
    expect(result.current.error).toBe(error.message);
  });

  it("reports one connection failure, not another picker failure", async () => {
    vi.mocked(googleSheetsService.saveConfig).mockRejectedValue(new AppError("validation", "Private column names"));
    const { result } = renderHook(() => useSpreadsheetSetup());
    await act(async () => result.current.onPickFromDrive());
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("setup_failed", { method: "existing_sheet", stage: "connect", error_kind: "validation" });
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it.each([new AppError("network", "private"), new Error("private")])("classifies creation failures without a completion event: %s", async (error) => {
    vi.mocked(googleSheetsService.createSpreadsheet).mockRejectedValue(error);
    const { result } = renderHook(() => useSpreadsheetSetup());
    await act(async () => result.current.onCreateSpreadsheet());
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("setup_failed", {
      method: "new_sheet", stage: "create", error_kind: error instanceof AppError ? "network" : "unexpected",
    });
    expect(saveConfig).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
  });

  it("preserves template-copy recovery without putting the template URL into analytics", async () => {
    const error = Object.assign(new AppError("network", "copy failed"), { templateCopyFailed: true, templateUrl: "https://private-template" });
    vi.mocked(googleSheetsService.createSpreadsheet).mockRejectedValue(error);
    const { result } = renderHook(() => useSpreadsheetSetup());
    await act(async () => result.current.onCreateSpreadsheet());
    expect(result.current.templateCopyUrl).toBe(error.templateUrl);
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("setup_failed", { method: "new_sheet", stage: "create", error_kind: "network" });
  });
});