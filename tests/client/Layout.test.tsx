import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Layout } from "../../app-web/components/Layout";

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
    config: null,
    isConfigLoading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock("../../app-web/contexts/DatasetContext", () => ({
  useDataset: () => ({
    snapshot: null,
    status: "idle",
    error: null,
    isLoadingHistory: false,
    searchFilters: { comment: "", categories: [], dateFrom: "", dateTo: "", amountFrom: "", amountTo: "", spentBy: "", spentByExact: false, spentFor: "", spentForExact: false, customFields: {}, customFieldsExact: {} },
    setSearchFilters: vi.fn(),
    loadDataset: vi.fn(),
    reloadDataset: vi.fn(),
    invalidateDataset: vi.fn(),
    appendToDataset: vi.fn(),
    updateInDataset: vi.fn(),
    removeLastFromDataset: vi.fn(),
    clearError: vi.fn(),
    distinctValues: { Category: [], spentBy: [], spentFor: [], customFields: {} },
  }),
}));

describe("Layout", () => {
  it("renders a Quick Expense brand link that navigates to /home", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/history"]}>
        <Routes>
          <Route
            path="/history"
            element={(
              <Layout title="History">
                <div>History page</div>
              </Layout>
            )}
          />
          <Route path="/home" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const brandLink = screen.getByRole("link", { name: "Quick Expense" });
    expect(brandLink.getAttribute("href")).toBe("/home");
    expect(brandLink.querySelector("img")?.getAttribute("src")).toBe("/QuickExpense_logo_512x512.png");

    await user.click(brandLink);

    expect(screen.getByText("Home page")).toBeTruthy();
  });
});
