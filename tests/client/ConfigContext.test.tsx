import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { ConfigProvider, useConfig } from "../../app-web/contexts/ConfigContext";
import { useAuth } from "../../app-web/contexts/AuthContext";
import { googleSheetsService } from "../../app-web/services/googleSheets";
import { AppError, AuthSession, SpreadsheetConfig } from "../../app-web/types/expense";

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../app-web/services/googleSheets", () => ({
  googleSheetsService: {
    getConfig: vi.fn(),
    getSpreadsheetFileName: vi.fn().mockResolvedValue({ fileName: null }),
    getDefaults: vi.fn().mockResolvedValue({ version: "1", values: { Theme: "Vacation" } }),
    saveDefault: vi.fn(),
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
  const { config, isConfigLoading, defaults, defaultsConflict, defaultsError, loadDefaults, saveDefault } = useConfig();
  return (
    <div>
      <span data-testid="loading">{String(isConfigLoading)}</span>
      <span data-testid="spreadsheetId">{config?.spreadsheetId ?? "none"}</span>
      <span data-testid="default-value">{defaults?.values.Theme ?? "none"}</span>
      <span data-testid="default-conflict">{String(defaultsConflict)}</span>
      <span data-testid="default-error">{defaultsError}</span>
      <button onClick={() => void loadDefaults()}>load defaults</button>
      <button onClick={() => void saveDefault("Theme", "New").catch(() => undefined)}>save default</button>
    </div>
  );
}

// Re-renders ConfigProvider with a new `session` reference (same email) on each "touch"
// click — mirroring what AuthContext.touchSession() does on every loadDataset() call.
function Harness(): JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(makeSession());
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
      <button onClick={() => setSession((s) => s ? { ...s, lastActivityAt: Date.now() } : s)}>touch</button>
      <button onClick={() => setSession(null)}>sign out</button>
      <button onClick={() => setSession(makeSession())}>sign in</button>
    </ConfigProvider>
  );
}

describe("ConfigContext — config fetch effect", () => {
  beforeEach(() => {
    vi.mocked(googleSheetsService.getConfig).mockReset().mockResolvedValue({ config: makeConfig() });
    vi.mocked(googleSheetsService.getDefaults).mockReset().mockResolvedValue({ version: "1", values: { Theme: "Vacation" } });
    vi.mocked(googleSheetsService.saveDefault).mockReset().mockResolvedValue({ version: "2", values: { Theme: "New" } });
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

  it("checks known versions and keeps confirmed defaults after a stale mutation", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await user.click(screen.getByText("load defaults"));
    await waitFor(() => expect(screen.getByTestId("default-value").textContent).toBe("Vacation"));
    vi.mocked(googleSheetsService.getDefaults).mockResolvedValueOnce({ unchanged: true, version: "1" });
    await user.click(screen.getByText("load defaults"));
    expect(googleSheetsService.getDefaults).toHaveBeenLastCalledWith("1");
    const conflict = new AppError("network", "Reload required");
    conflict.code = "DEFAULTS_CONFLICT";
    vi.mocked(googleSheetsService.saveDefault).mockRejectedValueOnce(conflict);
    await user.click(screen.getByText("save default"));
    await waitFor(() => expect(screen.getByTestId("default-conflict").textContent).toBe("true"));
    expect(screen.getByTestId("default-value").textContent).toBe("Vacation");
    await user.click(screen.getByText("save default"));
    expect(googleSheetsService.saveDefault).toHaveBeenCalledTimes(1);
  });

  it("allows fallback when defaults fail to load", async () => {
    vi.mocked(googleSheetsService.getDefaults).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await user.click(screen.getByText("load defaults"));
    await waitFor(() => expect(screen.getByTestId("default-error").textContent).toContain("manually"));
    expect(screen.getByTestId("default-value").textContent).toBe("none");
  });

  it("ignores late defaults from a previous session with the same email", async () => {
    let resolveOld!: (value: { version: string; values: Record<string, string> }) => void;
    vi.mocked(googleSheetsService.getDefaults).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await user.click(screen.getByText("load defaults"));
    await user.click(screen.getByText("sign out"));
    expect(screen.getByTestId("default-value").textContent).toBe("none");
    await user.click(screen.getByText("sign in"));
    await waitFor(() => expect(screen.getByTestId("spreadsheetId").textContent).toBe("abc123"));
    await user.click(screen.getByText("load defaults"));
    await waitFor(() => expect(screen.getByTestId("default-value").textContent).toBe("Vacation"));
    await act(async () => resolveOld({ version: "0", values: { Theme: "Old session" } }));
    expect(screen.getByTestId("default-value").textContent).toBe("Vacation");
  });

  it("does not downgrade a saved snapshot when an older read finishes later", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await user.click(screen.getByText("load defaults"));
    let resolveOld!: (value: { version: string; values: Record<string, string> }) => void;
    vi.mocked(googleSheetsService.getDefaults).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await user.click(screen.getByText("load defaults"));
    await user.click(screen.getByText("save default"));
    await waitFor(() => expect(screen.getByTestId("default-value").textContent).toBe("New"));
    await act(async () => resolveOld({ version: "1", values: { Theme: "Vacation" } }));
    expect(screen.getByTestId("default-value").textContent).toBe("New");
  });
});
