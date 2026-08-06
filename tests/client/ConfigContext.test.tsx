import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { ConfigProvider, useConfig } from "../../app-web/contexts/ConfigContext";
import { useAuth } from "../../app-web/contexts/AuthContext";
import { googleSheetsService } from "../../app-web/services/googleSheets";
import { AuthSession, SpreadsheetConfig } from "../../app-web/types/expense";

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../app-web/services/googleSheets", () => ({
  googleSheetsService: {
    getConfig: vi.fn(),
    getSpreadsheetFileName: vi.fn().mockResolvedValue({ fileName: null }),
  },
}));

function makeSession(): AuthSession {
  return {
    email: "test@example.com",
    givenName: "Test",
    picture: null,
    lastAuthenticatedAt: 0,
    lastActivityAt: 0,
    isGuest: false,
    guestAccessLevel: null,
    ownerEmail: null,
    configStatus: "ok",
  };
}

function makeConfig(): SpreadsheetConfig {
  return {
    email: "test@example.com",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc123/edit",
    spreadsheetId: "abc123",
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

function Probe(): JSX.Element {
  const { config, isConfigLoading } = useConfig();
  return (
    <div>
      <span data-testid="loading">{String(isConfigLoading)}</span>
      <span data-testid="spreadsheetId">{config?.spreadsheetId ?? "none"}</span>
    </div>
  );
}

// Re-renders ConfigProvider with a new `session` reference (same email) on each "touch"
// click — mirroring what AuthContext.touchSession() does on every loadDataset() call.
function Harness(): JSX.Element {
  const [session, setSession] = useState(makeSession());
  vi.mocked(useAuth).mockReturnValue({
    session,
    status: "signed_in",
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    touchSession: vi.fn(),
    clearError: vi.fn(),
  });

  return (
    <ConfigProvider>
      <Probe />
      <button onClick={() => setSession((s) => ({ ...s, lastActivityAt: Date.now() }))}>touch</button>
    </ConfigProvider>
  );
}

describe("ConfigContext — config fetch effect", () => {
  beforeEach(() => {
    vi.mocked(googleSheetsService.getConfig).mockReset().mockResolvedValue({ config: makeConfig() });
  });

  it("does not refetch config when the session reference changes but email stays the same", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("spreadsheetId").textContent).toBe("abc123");
    expect(googleSheetsService.getConfig).toHaveBeenCalledTimes(1);

    // Simulates touchSession() bumping lastActivityAt (e.g. triggered by loadDataset()).
    await user.click(screen.getByText("touch"));

    expect(googleSheetsService.getConfig).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});
