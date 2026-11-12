import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SetupPage } from "../../app-web/pages/SetupPage";
import userEvent from "@testing-library/user-event";
import { trackEvent } from "../../app-web/services/analytics";

const setupState = vi.hoisted(() => ({ hasConfig: true, isLoading: false }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { email: "owner@example.com", givenName: "Owner", picture: null, guestAccessLevel: null },
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
    config: setupState.hasConfig ? {
      spreadsheetId: "sheet123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet123",
      currencies: [],
      customColumns: [],
      hiddenColumns: [],
      isGuest: false,
      ownerEmail: "owner@example.com",
      configMode: "default",
    } : null,
    isConfigLoading: setupState.isLoading,
    error: null,
    clearError: vi.fn(),
    saveConfig: vi.fn(),
    clearConfig: vi.fn(),
    updateStructure: vi.fn(),
    toggleColumnVisibility: vi.fn(),
    defaults: null,
    defaultsError: null,
    defaultsConflict: false,
    isDefaultsLoading: false,
    isDefaultsSaving: false,
    loadDefaults: vi.fn().mockResolvedValue(null),
    saveDefault: vi.fn(),
    fileName: "My Sheet",
    isFileNameLoading: false,
  }),
}));

vi.mock("../../app-web/contexts/DatasetContext", () => ({
  useDataset: () => ({ snapshot: null, status: "idle", error: null }),
}));

vi.mock("../../app-web/services/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("../../app-web/services/sharingApi", () => ({
  sharingApi: {
    listShares: vi.fn().mockResolvedValue([]),
    addShare: vi.fn(),
    updateShare: vi.fn(),
    removeShare: vi.fn(),
  },
}));

vi.mock("../../app-web/services/googleSheets", () => ({
  googleSheetsService: {
    getAvailableCurrencies: vi.fn().mockResolvedValue({ currencies: [], maxOptional: 0 }),
    getColumnMapping: vi.fn().mockResolvedValue({ mapping: null, mode: "default", detectedColumns: [] }),
  },
}));

vi.mock("../../app-web/services/googlePicker", () => ({ openSpreadsheetPicker: vi.fn() }));

function renderSetupPage() {
  return render(
    <MemoryRouter initialEntries={["/setup"]}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SetupPage — Comment column is non-hideable", () => {
  beforeEach(() => {
    setupState.hasConfig = true;
    setupState.isLoading = false;
    vi.mocked(trackEvent).mockClear();
  });

  it("does not render an Eye or EyeOff button for the Comment row", () => {
    renderSetupPage();
    expect(screen.queryByRole("button", { name: /hide comment from add form/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /show comment on add form/i })).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("records explicit choices, including switching paths, but not back navigation", async () => {
    setupState.hasConfig = false;
    renderSetupPage();
    expect(trackEvent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Create my spreadsheet" }));
    expect(trackEvent).toHaveBeenLastCalledWith("setup_path_selected", { method: "new_sheet" });
    await userEvent.click(screen.getByRole("button", { name: /Back to options/ }));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Connect a spreadsheet" }));
    expect(trackEvent).toHaveBeenLastCalledWith("setup_path_selected", { method: "existing_sheet" });
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("does not record a selection while config is loading", async () => {
    setupState.hasConfig = false;
    setupState.isLoading = true;
    renderSetupPage();
    await userEvent.click(screen.getByRole("button", { name: "Create my spreadsheet" }));
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
