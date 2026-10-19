import { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppActivityTracker } from "../../app-web/components/AppActivityTracker";

const mockSession = vi.hoisted(() => ({
  status: "signed_in",
  session: { email: "user@example.com", isAppAdmin: false },
}));
vi.mock("../../app-web/contexts/AuthContext", () => ({ useAuth: () => mockSession }));

function successfulJson(payload: unknown) {
  return { ok: true, json: async () => payload };
}

beforeEach(() => {
  mockSession.status = "signed_in";
  mockSession.session = { email: "user@example.com", isAppAdmin: false };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("/api/activity/envelope")
      ? successfulJson({ envelope: "signed-envelope" })
      : successfulJson({ accepted: true }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("AppActivityTracker", () => {
  it("records one settled authenticated screen arrival with an event-bound envelope", async () => {
    render(<StrictMode><MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter></StrictMode>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const requests = vi.mocked(fetch).mock.calls;
    expect(String(requests[0][0])).toContain("screen=history");
    const body = JSON.parse(String(requests[1][1]?.body));
    expect(body).toMatchObject({ screen: "history", envelope: "signed-envelope" });
    expect(body.eventId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("reuses an unexpired event ID after a lost response", async () => {
    const key = "user@example.com:default:history";
    sessionStorage.setItem(`qe-activity:${key}`, JSON.stringify({ id: "saved-event-id", createdAt: Date.now() }));
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("eventId=saved-event-id");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).eventId).toBe("saved-event-id");
  });

  it("replaces expired or malformed persisted event IDs", async () => {
    const key = "user@example.com:default:history";
    sessionStorage.setItem(`qe-activity:${key}`, JSON.stringify({ id: "expired-id", createdAt: Date.now() - 120_001 }));
    const { unmount } = render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain("expired-id");
    unmount();
    vi.mocked(fetch).mockClear();
    sessionStorage.setItem(`qe-activity:${key}`, "not-json");
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/eventId=[0-9a-f-]{36}/i);
  });

  it("retries failed activity delivery with the same event ID", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("temporary network failure"));
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(fetch).toHaveBeenCalledTimes(3);
    const envelopeRequest = String(vi.mocked(fetch).mock.calls[1][0]);
    const postBody = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body));
    expect(postBody.eventId).toBe(new URL(envelopeRequest, "http://localhost").searchParams.get("eventId"));
    vi.useRealTimers();
  });

  it("continues without cross-tab storage when the fallback lock is unavailable", async () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    const storage = {
      getItem: vi.fn((key: string) => { if (key === "qe-activity-lock") throw new Error("Storage unavailable"); return null; }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    try {
      render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(storage.getItem).toHaveBeenCalledWith("qe-activity-lock");
    } finally {
      if (localStorageDescriptor) Object.defineProperty(window, "localStorage", localStorageDescriptor);
      else delete (window as { localStorage?: Storage }).localStorage;
      if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor);
      else delete (navigator as { locks?: LockManager }).locks;
    }
  });

  it.each(["/", "/auth/callback", "/logs"])("does not record redirect or non-SPA route %s", async (path) => {
    render(<MemoryRouter initialEntries={[path]}><AppActivityTracker /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not record admin navigation for a non-admin account", async () => {
    render(<MemoryRouter initialEntries={["/admin"]}><AppActivityTracker /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records admin navigation only when the server-derived admin claim is true", async () => {
    mockSession.session = { email: "admin@example.com", isAppAdmin: true };
    render(<MemoryRouter initialEntries={["/admin"]}><AppActivityTracker /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("screen=admin");
  });

  it("does not record an arrival while the document is hidden", async () => {
    const original = document.visibilityState;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    render(<MemoryRouter initialEntries={["/home"]}><AppActivityTracker /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: original });
  });
});
