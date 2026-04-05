// @vitest-environment node
const mockQuery = vi.fn();

vi.mock("../server/db.js", () => ({
  default: { query: (...args) => mockQuery(...args) },
}));

let getUserRecord;
let updateUserRecord;
let saveFxRateBackup;
let getLatestFxRateBackup;

beforeAll(async () => {
  ({ getUserRecord, updateUserRecord, saveFxRateBackup, getLatestFxRateBackup } = await import(
    "../server/store.js"
  ));
});

beforeEach(() => {
  mockQuery.mockReset();
});

describe("getUserRecord", () => {
  it("returns null when no user exists", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getUserRecord("nobody@test.com");

    expect(result).toBeNull();
    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM users WHERE email = $1", ["nobody@test.com"]);
  });

  it("maps a database row to a user record object", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          email: "user@test.com",
          access_token: "at-123",
          access_token_expires_at: "1700000000000",
          refresh_token: "rt-456",
          spreadsheet_url: "https://docs.google.com/spreadsheets/d/abc/edit",
          spreadsheet_id: "abc",
          last_authenticated_at: "1699999000000",
          last_activity_at: "1699999500000",
        },
      ],
    });

    const result = await getUserRecord("User@Test.com");

    expect(result).toEqual({
      email: "user@test.com",
      accessToken: "at-123",
      accessTokenExpiresAt: 1700000000000,
      refreshToken: "rt-456",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit",
      spreadsheetId: "abc",
      lastAuthenticatedAt: 1699999000000,
      lastActivityAt: 1699999500000,
    });
    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM users WHERE email = $1", ["user@test.com"]);
  });
});

describe("updateUserRecord", () => {
  it("upserts a new user when none exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // getUserRecord SELECT
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT ... ON CONFLICT

    const updater = (current) => ({
      ...current,
      accessToken: "new-token",
      accessTokenExpiresAt: 1700001000000,
      lastAuthenticatedAt: 1700000000000,
      lastActivityAt: 1700000000000,
    });

    const result = await updateUserRecord("new@test.com", updater);

    expect(result.accessToken).toBe("new-token");
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO users");
    expect(mockQuery.mock.calls[1][0]).toContain("ON CONFLICT");
  });

  it("updates an existing user", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          email: "existing@test.com",
          access_token: "old-token",
          access_token_expires_at: "1700000000000",
          refresh_token: "rt-1",
          spreadsheet_url: null,
          spreadsheet_id: null,
          last_authenticated_at: "1699999000000",
          last_activity_at: "1699999000000",
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await updateUserRecord("existing@test.com", (current) => ({
      ...current,
      accessToken: "refreshed-token",
      accessTokenExpiresAt: 1700002000000,
    }));

    expect(result.accessToken).toBe("refreshed-token");
    expect(result.refreshToken).toBe("rt-1");
  });
});

describe("saveFxRateBackup", () => {
  it("inserts one row per non-null currency rate", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await saveFxRateBackup("user@test.com", "sheet-1", {
      expenseDate: "2026-03-17",
      rates: { PLN: "3,72", BYN: null, EUR: "1.16" },
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const plnCall = mockQuery.mock.calls[0];
    expect(plnCall[0]).toContain("INSERT INTO fx_rate_backups");
    expect(plnCall[1]).toContain("PLN");
    expect(plnCall[1]).toContain(3.72);

    const eurCall = mockQuery.mock.calls[1];
    expect(eurCall[1]).toContain("EUR");
    expect(eurCall[1]).toContain(1.16);
  });

  it("skips currencies with null or empty rates", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await saveFxRateBackup("user@test.com", "sheet-1", {
      expenseDate: "2026-03-17",
      rates: { PLN: null, BYN: "", EUR: null },
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("getLatestFxRateBackup", () => {
  it("returns null when no backups exist", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getLatestFxRateBackup("user@test.com", "sheet-1");
    expect(result).toBeNull();
  });

  it("assembles currency rows into a rates object", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { currency_code: "PLN", fx_rate: "3.720000" },
        { currency_code: "EUR", fx_rate: "1.160000" },
      ],
    });

    const result = await getLatestFxRateBackup("user@test.com", "sheet-1");

    expect(result).toEqual({
      rates: {
        PLN: "3.720000",
        BYN: null,
        EUR: "1.160000",
      },
    });
  });
});
