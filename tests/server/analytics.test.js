// @vitest-environment node
const mockQuery = vi.fn();
const mockWarn = vi.fn();

vi.mock("pg", () => ({ default: { Pool: class MockPool { query = (...args) => mockQuery(...args); } } }));
vi.mock("../../app-server/logger.js", () => ({ default: { warn: (...args) => mockWarn(...args) } }));

let deliverAnalyticsOutbox;

const EVENT = {
  event_id: "11111111-1111-4111-8111-111111111111",
  event: "user_signed_up",
  distinct_id: "hash",
  properties: {},
  occurred_at: new Date("2026-01-02T03:04:05.000Z"),
  attempts: 1,
};

beforeAll(async () => {
  ({ deliverAnalyticsOutbox } = await import("../../app-server/analytics.js"));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockWarn.mockReset();
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("deliverAnalyticsOutbox", () => {
  it("should do nothing when analytics is not configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    await deliverAnalyticsOutbox();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should not call PostHog when nothing is due", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await deliverAnalyticsOutbox();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should send leased events with their stable UUID and timestamp, then mark them delivered", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mockQuery.mockResolvedValueOnce({ rows: [EVENT] }).mockResolvedValueOnce({ rows: [] });

    await deliverAnalyticsOutbox();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/batch/");
    expect(JSON.parse(init.body)).toEqual({
      api_key: "phc_test",
      batch: [{
        uuid: EVENT.event_id, event: "user_signed_up", distinct_id: "hash",
        properties: { $lib: "quick-expense-server" }, timestamp: "2026-01-02T03:04:05.000Z",
      }],
    });
    expect(mockQuery.mock.calls[1][0]).toContain("delivered_at = now()");
    expect(mockQuery.mock.calls[1][1]).toEqual([[EVENT.event_id]]);
  });

  it.each([
    ["HTTP error", () => vi.fn().mockResolvedValue({ ok: false, status: 503 }), "PostHog responded with HTTP 503"],
    ["network error", () => vi.fn().mockRejectedValue(new Error("offline")), "offline"],
  ])("should back off and keep the events pending on %s", async (_name, makeFetch, message) => {
    vi.stubGlobal("fetch", makeFetch());
    mockQuery.mockResolvedValueOnce({ rows: [EVENT] }).mockResolvedValueOnce({ rows: [] });

    await deliverAnalyticsOutbox();

    expect(mockQuery.mock.calls[1][0]).toContain("next_attempt_at");
    expect(mockQuery.mock.calls[1][0]).not.toContain("delivered_at");
    expect(mockQuery.mock.calls[1][1]).toEqual([[EVENT.event_id], message]);
    expect(mockWarn).toHaveBeenCalledWith("analytics_delivery_failed", expect.objectContaining({ error: message }));
  });

  it("should release the delivery guard after a database failure so the next tick can retry", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    await expect(deliverAnalyticsOutbox()).rejects.toThrow("db down");

    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(deliverAnalyticsOutbox()).resolves.toBeUndefined();
  });
});
