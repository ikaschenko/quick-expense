import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../../app-web/components/ProtectedRoute";

const mockAuth = vi.hoisted(() => ({ status: "signed_in", session: null as null | { isAppAdmin?: boolean } }));
vi.mock("../../app-web/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));

function renderAdminRoute(): void {
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/" element={<div>Sign-in page</div>} />
        <Route path="/home" element={<div>Home page</div>} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><div>Private admin panel</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute admin access", () => {
  beforeEach(() => {
    mockAuth.status = "signed_in";
    mockAuth.session = null;
  });

  it("allows an admin to open the panel without any spreadsheet setup state", () => {
    mockAuth.session = { isAppAdmin: true };

    renderAdminRoute();

    expect(screen.getByText("Private admin panel")).toBeTruthy();
  });

  it("redirects a signed-in non-admin away from the direct admin URL", () => {
    mockAuth.session = { isAppAdmin: false };

    renderAdminRoute();

    expect(screen.queryByText("Private admin panel")).toBeNull();
    expect(screen.getByText("Home page")).toBeTruthy();
  });

  it("redirects an expired or missing authenticated session to sign-in", () => {
    mockAuth.status = "signed_out";

    renderAdminRoute();

    expect(screen.queryByText("Private admin panel")).toBeNull();
    expect(screen.getByText("Sign-in page")).toBeTruthy();
  });
});
