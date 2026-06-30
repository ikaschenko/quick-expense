import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AddExpensePage } from "../src/pages/AddExpensePage";

// Mock all context hooks so AddExpensePage can be rendered in isolation.
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { guestAccessLevel: "view", email: "guest@example.com", givenName: "Guest", picture: null },
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
    config: null,
    isConfigLoading: true,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock("../src/contexts/DatasetContext", () => ({
  useDataset: () => ({
    snapshot: null,
    status: "idle",
    error: null,
    isLoadingHistory: false,
    loadDataset: vi.fn(),
    reloadDataset: vi.fn(),
    removeLastFromDataset: vi.fn(),
    distinctValues: {},
    searchFilters: { comment: "", categories: [], amountFrom: "", amountTo: "", customFields: {} },
    setSearchFilters: vi.fn(),
  }),
}));

vi.mock("../src/services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../src/services/googleSheets", () => ({
  googleSheetsService: {
    getAvailableCurrencies: vi.fn().mockResolvedValue({ currencies: [] }),
    getLatestFxRateBackup: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../src/services/currency", () => ({
  currencyService: {
    fetchLiveRates: vi.fn().mockResolvedValue({}),
    parseManualFxRates: vi.fn().mockReturnValue({}),
    convertToUsdFromRates: vi.fn().mockReturnValue(null),
  },
}));

describe("AddExpensePage — view-only redirect", () => {
  it("redirects to /home when guestAccessLevel is 'view' on /add", () => {
    render(
      <MemoryRouter initialEntries={["/add"]}>
        <Routes>
          <Route path="/add" element={<AddExpensePage />} />
          <Route path="/home" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Home Page")).toBeTruthy();
  });

  it("redirects to /home when guestAccessLevel is 'view' on edit URL", () => {
    render(
      <MemoryRouter initialEntries={["/edit/5"]}>
        <Routes>
          <Route path="/edit/:rowNumber" element={<AddExpensePage />} />
          <Route path="/home" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Home Page")).toBeTruthy();
  });
});
