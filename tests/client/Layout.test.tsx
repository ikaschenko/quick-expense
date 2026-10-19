import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Layout } from "../../app-web/components/Layout";

const mockAdminAccess = vi.hoisted(() => ({ isAppAdmin: false }));

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { guestAccessLevel: null, email: "test@example.com", givenName: "Test", picture: null, isAppAdmin: mockAdminAccess.isAppAdmin },
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
  beforeEach(() => { mockAdminAccess.isAppAdmin = false; });

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
  it("shows an accessible Admin view link after Sign out with a separator for admins", async () => {
    mockAdminAccess.isAppAdmin = true;
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/history"]}><Layout><div>History</div></Layout></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    const signOut = screen.getByRole("button", { name: "Sign out" });
    const adminLink = screen.getByRole("link", { name: "Admin view" });
    expect(adminLink.getAttribute("href")).toBe("/admin");
    expect(signOut.compareDocumentPosition(adminLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[role="separator"].admin-menu-separator')).toBeTruthy();
  });

  it("does not expose the Admin view entry to non-admin users", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/history"]}><Layout><div>History</div></Layout></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.queryByRole("link", { name: "Admin view" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

});
