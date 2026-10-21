import { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
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
  vi.useRealTimers();
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

  it("never renews an expired original arrival", async () => {
    const key = "user@example.com:default:history";
    sessionStorage.setItem(`qe-activity:${key}`, JSON.stringify({ id: "expired-id", createdAt: Date.now() - 120_001, envelope: "original" }));
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("replaces malformed persisted arrivals", async () => {
    sessionStorage.setItem("qe-activity:user@example.com:default:history", "not-json");
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
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

  it("does not emit for ineligible screens", async () => {
    render(<MemoryRouter initialEntries={["/add"]}><AppActivityTracker eligible={false} /></MemoryRouter>);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/add", "/edit/invalid"])("ignores a redirect intermediate %s", async (path) => {
    render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path={path} element={<><AppActivityTracker /><Navigate to="/home" replace /></>} />
      <Route path="/home" element={<AppActivityTracker />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("screen=home");
  });

  it("ignores state replacements but records a real same-screen push", async () => {
    function Navigation() {
      const navigate = useNavigate();
      return <><button onClick={() => navigate("/history", { replace: true, state: { cleared: true } })}>Replace</button>
        <button onClick={() => navigate("/history")}>Push</button><AppActivityTracker /></>;
    }
    const { getByText } = render(<MemoryRouter initialEntries={["/history"]}><Navigation /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await act(async () => { getByText("Replace").click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { getByText("Push").click(); });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  });

  it("reuses the original envelope after a lost POST response", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/envelope")) return successfulJson({ envelope: "original-envelope" }) as Response;
      throw new Error("lost response");
    });
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.filter(([url]) => String(url).includes("/envelope"))).toHaveLength(1);
    const posts = calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map(([, options]) => String(options?.body))).size).toBe(1);
  });

  it("refuses submission after acquiring a lock beyond the original deadline", async () => {
    vi.useFakeTimers();
    let acquire: (() => Promise<void>) | undefined;
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn((_name, action) => { acquire = action; return new Promise(() => undefined); }) } });
    try {
      render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(acquire).toBeDefined();
      vi.setSystemTime(Date.now() + 120_000);
      await act(async () => { await acquire?.(); });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else delete (navigator as { locks?: LockManager }).locks;
    }
  });

  it("refuses a delayed retry once the original arrival is two minutes old", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<MemoryRouter initialEntries={["/history"]}><AppActivityTracker /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 120_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(fetch).toHaveBeenCalledTimes(1);
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
