import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SetupPage } from "../../app-web/pages/SetupPage";

const { mockRefreshSession, mockNavigate, mockResetGuestConfig } = vi.hoisted(() => ({
  mockRefreshSession: vi.fn(),
  mockNavigate: vi.fn(),
  mockResetGuestConfig: vi.fn(),
}));
const defaultsFixture = vi.hoisted(() => ({
  accessLevel: "edit" as "edit" | "view",
  save: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(null),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { email: "guest@example.com", givenName: "Guest", picture: null, guestAccessLevel: "edit" },
    error: null,
    status: "signed_in",
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshSession: mockRefreshSession,
    touchSession: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("../../app-web/contexts/ConfigContext", () => ({
  useConfig: () => ({
    config: {
      spreadsheetId: "sheet123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet123",
      currencies: [],
      customColumns: ["Theme"],
      hiddenColumns: ["Theme"],
      isGuest: true,
      accessLevel: defaultsFixture.accessLevel,
      ownerEmail: "owner@example.com",
      configMode: "default",
    },
    isConfigLoading: false,
    error: null,
    clearError: vi.fn(),
    saveConfig: vi.fn(),
    clearConfig: vi.fn(),
    updateStructure: vi.fn(),
    toggleColumnVisibility: vi.fn(),
    defaults: { version: "2", values: { Theme: "Vacation" } },
    defaultsError: null,
    defaultsConflict: false,
    isDefaultsLoading: false,
    isDefaultsSaving: false,
    loadDefaults: defaultsFixture.load,
    saveDefault: defaultsFixture.save,
    fileName: "My Sheet",
    isFileNameLoading: false,
  }),
}));

vi.mock("../../app-web/contexts/DatasetContext", () => ({
  useDataset: () => ({
    snapshot: null,
    status: "idle",
    error: null,
  }),
}));

vi.mock("../../app-web/services/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("../../app-web/services/sharingApi", () => ({
  sharingApi: {
    resetGuestConfig: mockResetGuestConfig,
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

beforeEach(() => {
  mockResetGuestConfig.mockReset();
  mockRefreshSession.mockReset();
  mockNavigate.mockReset();
  defaultsFixture.accessLevel = "edit";
  defaultsFixture.save.mockClear();
});

describe("SetupPage — guest unlink", () => {
  it("shows Edit guests a management hint for hidden defaults without mutation actions", async () => {
    renderSetupPage();
    expect(screen.getByText("Vacation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Default value for Theme: Vacation" }));
    expect(screen.getByRole("tooltip").textContent).toBe("To manage the default values please use Add Expense screen");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace default" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear default" })).toBeNull();
    expect(defaultsFixture.save).not.toHaveBeenCalled();
    await waitFor(() => expect(defaultsFixture.load).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Rename Theme" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Theme" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Show Theme/ })).toBeNull();
  });

  it("lets View guests inspect defaults with a tooltip instead of Replace or Clear", async () => {
    defaultsFixture.accessLevel = "view";
    renderSetupPage();
    fireEvent.click(screen.getByRole("button", { name: "Default value for Theme: Vacation" }));
    expect(screen.getByRole("tooltip").textContent).toBe("To manage the default values please use Add Expense screen");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace default" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear default" })).toBeNull();
    expect(defaultsFixture.save).not.toHaveBeenCalled();
    await waitFor(() => expect(defaultsFixture.load).toHaveBeenCalled());
  });

  it("renders the Unlink button in the guest banner", () => {
    renderSetupPage();
    expect(screen.getByText(/This setup has been shared with you by/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unlink/i })).toBeTruthy();
  });

  it("opens the confirmation dialog when Unlink is clicked", () => {
    renderSetupPage();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Unlink from shared setup\?/i)).toBeTruthy();
    expect(screen.getAllByText(/owner@example\.com/).length).toBeGreaterThanOrEqual(1);
  });

  it("closes the dialog without calling the API when Cancel is clicked", () => {
    renderSetupPage();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockResetGuestConfig).not.toHaveBeenCalled();
  });

  it("calls resetGuestConfig, refreshSession, and navigate on confirm", async () => {
    mockResetGuestConfig.mockResolvedValue(undefined);
    mockRefreshSession.mockResolvedValue(undefined);

    renderSetupPage();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, unlink/i }));

    await waitFor(() => expect(mockResetGuestConfig).toHaveBeenCalledTimes(1));
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/setup");
  });

  it("shows an inline error and keeps dialog open when the API call fails", async () => {
    mockResetGuestConfig.mockRejectedValue(new Error("Network error"));

    renderSetupPage();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, unlink/i }));

    await waitFor(() => expect(screen.getByText("Network error")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
