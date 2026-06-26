import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SetupPage } from "../src/pages/SetupPage";

const { mockRefreshSession, mockNavigate, mockResetGuestConfig } = vi.hoisted(() => ({
  mockRefreshSession: vi.fn(),
  mockNavigate: vi.fn(),
  mockResetGuestConfig: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../src/contexts/AuthContext", () => ({
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

vi.mock("../src/contexts/ConfigContext", () => ({
  useConfig: () => ({
    config: {
      spreadsheetId: "sheet123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet123",
      currencies: [],
      customColumns: [],
      hiddenColumns: [],
      isGuest: true,
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
    fileName: "My Sheet",
    isFileNameLoading: false,
  }),
}));

vi.mock("../src/contexts/DatasetContext", () => ({
  useDataset: () => ({
    snapshot: null,
    status: "idle",
    error: null,
  }),
}));

vi.mock("../src/services/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("../src/services/sharingApi", () => ({
  sharingApi: {
    resetGuestConfig: mockResetGuestConfig,
    listShares: vi.fn().mockResolvedValue([]),
    addShare: vi.fn(),
    updateShare: vi.fn(),
    removeShare: vi.fn(),
  },
}));

vi.mock("../src/services/googleSheets", () => ({
  googleSheetsService: {
    getAvailableCurrencies: vi.fn().mockResolvedValue({ currencies: [], maxOptional: 0 }),
    getColumnMapping: vi.fn().mockResolvedValue({ mapping: null, mode: "default", detectedColumns: [] }),
  },
}));

vi.mock("../src/services/googlePicker", () => ({ openSpreadsheetPicker: vi.fn() }));

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
});

describe("SetupPage — guest unlink", () => {
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
