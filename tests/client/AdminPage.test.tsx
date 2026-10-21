import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminPage } from "../../app-web/pages/AdminPage";
import { adminApi } from "../../app-web/services/adminApi";

const mockAuth = vi.hoisted(() => ({ refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock("../../app-web/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("../../app-web/services/adminApi", () => ({ adminApi: { getUsageMetrics: vi.fn() } }));

const sampleMetrics = {
  snapshotAt: "2026-10-19T12:00:00.000Z",
  timezone: "UTC" as const,
  trackingStartedAt: "2026-07-01T00:00:00.000Z",
  periods: {
    current: { start: "2026-09-19", end: "2026-10-18", endExclusive: "2026-10-19" },
    previous: { start: "2026-08-20", end: "2026-09-18", endExclusive: "2026-09-19" },
  },
  coverage: { current: "complete" as const, previous: "complete" as const },
  users: {
    total: 10,
    connected: { count: 6, percent: 60 },
    setup: {
      created: { count: 2, percent: 20 }, existing: { count: 1, percent: 10 },
      shared: { count: 1, percent: 10 }, unknown: { count: 2, percent: 20 }, none: { count: 4, percent: 40 },
    },
    active: { current: 5, previous: 4, change: { kind: "increase" as const, absolute: 1, percent: 25 } },
    new: { current: 3, previous: 2, change: { kind: "increase" as const, absolute: 1, percent: 50 } },
  },
  sessions: {
    lifetime: 25, current: 6, previous: 4, averagePerDay: { current: 0.2, previous: 0.1 },
    change: { kind: "increase" as const, absolute: 2, percent: 50 },
    averageChange: { kind: "increase" as const, absolute: 0.0666666667, percent: 66.7 },
  },
};

function renderPage(): void {
  render(<MemoryRouter><AdminPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(adminApi.getUsageMetrics).mockReset();
  mockAuth.refreshSession.mockReset();
  mockAuth.signOut.mockReset();
});

describe("AdminPage", () => {
  it("loads user adoption, partial setup emphasis, UTC comparisons, sessions, and same-tab logs", async () => {
    vi.mocked(adminApi.getUsageMetrics).mockResolvedValue(sampleMetrics);
    renderPage();

    expect(screen.getAllByRole("status").some((element) => element.textContent?.includes("Loading administration metrics"))).toBe(true);
    expect(await screen.findByRole("heading", { name: "QuickExpense Administration Panel" })).toBeTruthy();
    expect(screen.getByText("Currently connected users")).toBeTruthy();
    expect(screen.getByText("No connected setup")).toBeTruthy();
    expect(screen.getByText("Active users · last 30 days")).toBeTruthy();
    expect(screen.getByText("Average sessions per day")).toBeTruthy();
    expect(screen.getAllByText(/UTC$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View server logs" }).getAttribute("href")).toBe("/logs");
    expect(vi.mocked(adminApi.getUsageMetrics)).toHaveBeenCalledOnce();
  });

  it("shows insufficient history and observed counts while withholding complete-period comparisons", async () => {
    vi.mocked(adminApi.getUsageMetrics).mockResolvedValue({
      ...sampleMetrics,
      coverage: { current: "insufficient", previous: "insufficient" },
      sessions: { ...sampleMetrics.sessions, averagePerDay: { current: null, previous: null }, change: { kind: "unavailable" }, averageChange: { kind: "unavailable" } },
      users: { ...sampleMetrics.users, active: { ...sampleMetrics.users.active, change: { kind: "unavailable" } } },
    });
    renderPage();
    expect((await screen.findByText(/Insufficient history for one or both complete periods/)).textContent).toContain("Insufficient history");
    expect(screen.getByText("5", { selector: ".admin-metric-value" })).toBeTruthy();
    expect(screen.getByText("Insufficient history")).toBeTruthy();
    expect(screen.getAllByText("Comparison unavailable").length).toBeGreaterThan(0);
  });

  it("retains and marks a successful snapshot stale after refresh failure", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.getUsageMetrics).mockResolvedValueOnce(sampleMetrics).mockRejectedValueOnce(new Error("Database unavailable"));
    renderPage();
    await screen.findByText("Total users");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByRole("alert")).textContent).toContain("marked stale");
    expect(screen.getByText("Showing the last successful snapshot; this data may be stale.")).toBeTruthy();
    expect(screen.getByText("10", { selector: ".admin-metric-value" })).toBeTruthy();
  });

  it("offers retry after the first metrics request fails", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.getUsageMetrics).mockRejectedValueOnce(new Error("Metrics unavailable")).mockResolvedValueOnce(sampleMetrics);
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("Metrics unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Total users")).toBeTruthy();
  });
});


describe("per-period observation status", () => {
  it("distinguishes an unavailable prior period from partially observed current counts and shows gaps", async () => {
    vi.mocked(adminApi.getUsageMetrics).mockResolvedValue({
      ...sampleMetrics,
      coverage: { current: "insufficient", previous: "unavailable" },
      users: { ...sampleMetrics.users, active: { current: 5, previous: null, change: { kind: "unavailable" } } },
      sessions: { ...sampleMetrics.sessions, previous: null },
      coverageGaps: [{ start: "2026-10-01T01:00:00Z", end: "2026-10-01T02:00:00Z" }],
    });
    renderPage();
    await screen.findByText("Total users");
    expect(screen.getAllByText(/Current:.*Observed partial counts.*Previous:.*Unavailable/)).toHaveLength(2);
    expect(screen.getAllByText("Previous period: Unavailable").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Tracking coverage gaps" }).textContent).toContain("2026-10-01T01:00:00.000Z");
  });
});
