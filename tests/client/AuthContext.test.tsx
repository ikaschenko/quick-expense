import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { AuthProvider, useAuth } from "../../app-web/contexts/AuthContext";
import { authApi } from "../../app-web/services/authApi";
import { identifyUser, resetUser, trackEvent } from "../../app-web/services/analytics";
import type { AuthSession } from "../../app-web/types/expense";

vi.mock("../../app-web/services/authApi", () => ({ authApi: { getSession: vi.fn(), startLogin: vi.fn(), logout: vi.fn() } }));
vi.mock("../../app-web/services/analytics", () => ({ identifyUser: vi.fn(), resetUser: vi.fn(), trackEvent: vi.fn() }));
vi.mock("../../app-web/services/metricsCache", () => ({ metricsCache: { clear: vi.fn() } }));

const session: AuthSession = {
  email: "user@example.com", givenName: null, picture: null,
  lastAuthenticatedAt: 1, lastActivityAt: 1, isGuest: false,
  guestAccessLevel: null, ownerEmail: null, configStatus: "ok",
};

function Probe() {
  const auth = useAuth();
  return <>
    <span>{auth.status}</span>
    <span>{auth.error}</span>
    <button onClick={auth.signIn}>Sign in</button>
    <button onClick={auth.signOut}>Sign out</button>
    <button onClick={() => void auth.refreshSession()}>Refresh</button>
  </>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authApi.getSession).mockResolvedValue(session);
  vi.mocked(authApi.logout).mockResolvedValue(undefined);
  vi.mocked(identifyUser).mockResolvedValue(undefined);
});

describe("AuthProvider", () => {
  it("identifies before publishing an authenticated session to descendants", async () => {
    let finish!: () => void;
    vi.mocked(identifyUser).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(identifyUser).toHaveBeenCalledWith(session.email, session));
    expect(screen.getByText("initializing")).toBeTruthy();
    await act(async () => finish());
    expect(screen.getByText("signed_in")).toBeTruthy();
  });

  it("does not turn a successful login into an auth error when analytics rejects", async () => {
    vi.mocked(identifyUser).mockRejectedValue(new Error("analytics unavailable"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("signed_in");
    expect(screen.queryByText("analytics unavailable")).toBeNull();
  });

  it("does not restore a signed-out user when an earlier session request resolves", async () => {
    let finish!: (value: AuthSession) => void;
    vi.mocked(authApi.getSession).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => finish(session));
    expect(screen.getByText("signed_out")).toBeTruthy();
    expect(identifyUser).not.toHaveBeenCalled();
    expect(resetUser).toHaveBeenCalledOnce();
  });

  it("does not restore a signed-out user when identification finishes late", async () => {
    let finish!: () => void;
    vi.mocked(identifyUser).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(identifyUser).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => finish());
    expect(screen.getByText("signed_out")).toBeTruthy();
  });

  it("ignores superseded startup requests in StrictMode", async () => {
    let finishOld!: (value: AuthSession) => void;
    vi.mocked(authApi.getSession).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>);
    await screen.findByText("signed_in");
    await act(async () => finishOld({ ...session, email: "stale@example.com" }));
    expect(identifyUser).toHaveBeenCalledTimes(1);
    expect(identifyUser).toHaveBeenCalledWith(session.email, session);
  });

  it("keeps login initiation separate from completion", async () => {
    vi.mocked(authApi.getSession).mockResolvedValue(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("signed_out");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(trackEvent).toHaveBeenCalledWith("sign_in");
    expect(authApi.startLogin).toHaveBeenCalledOnce();
    expect(identifyUser).not.toHaveBeenCalled();
  });

  it("reports session API failures without emitting completion events", async () => {
    vi.mocked(authApi.getSession).mockRejectedValue(new Error("Session unavailable"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("Session unavailable");
    expect(screen.getByText("signed_out")).toBeTruthy();
    expect(identifyUser).not.toHaveBeenCalled();
  });
});