// @vitest-environment node
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock("../server/db.js", () => ({
  default: {
    query: (...args) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

let getUserRecord;
let updateUserRecord;
let saveFxRateBackup;
let getLatestFxRateBackup;
let getActiveUserCurrencies;
let setUserCurrencies;
let initUserCurrenciesFromHeaders;
let getActiveCustomColumns;
let initCustomColumnsFromHeaders;
let syncCurrenciesFromSheet;
let syncCustomColumnsFromSheet;
let addCustomColumn;
let renameCustomColumn;
let reorderCustomColumns;
let removeCustomColumn;

beforeAll(async () => {
  ({
    getUserRecord,
    updateUserRecord,
    saveFxRateBackup,
    getLatestFxRateBackup,
    getActiveUserCurrencies,
    setUserCurrencies,
    initUserCurrenciesFromHeaders,
    getActiveCustomColumns,
    initCustomColumnsFromHeaders,
    syncCurrenciesFromSheet,
    syncCustomColumnsFromSheet,
    addCustomColumn,
    renameCustomColumn,
    reorderCustomColumns,
    removeCustomColumn,
  } = await import("../server/store.js"));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockReset();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockConnect.mockResolvedValue(mockClient);
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
        EUR: "1.160000",
      },
    });
  });
});

describe("getActiveUserCurrencies", () => {
  it("returns active currency codes ordered by added_at", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ currency_code: "PLN" }, { currency_code: "EUR" }],
    });

    const result = await getActiveUserCurrencies("user@test.com");
    expect(result).toEqual(["PLN", "EUR"]);
    expect(mockQuery.mock.calls[0][0]).toContain("removed_at IS NULL");
  });

  it("returns empty array when no currencies are configured", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await getActiveUserCurrencies("user@test.com");
    expect(result).toEqual([]);
  });
});

describe("setUserCurrencies", () => {
  it("marks removed currencies and inserts new ones in a transaction", async () => {
    // Current active: PLN, EUR; Desired: EUR, GBP
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ currency_code: "PLN" }, { currency_code: "EUR" }],
      }) // SELECT current
      .mockResolvedValueOnce({}) // UPDATE PLN removed_at
      .mockResolvedValueOnce({}) // INSERT GBP
      .mockResolvedValueOnce({}); // COMMIT

    await setUserCurrencies("user@test.com", ["EUR", "GBP"]);

    expect(mockClient.query).toHaveBeenCalledTimes(5);
    expect(mockClient.query.mock.calls[0][0]).toBe("BEGIN");
    expect(mockClient.query.mock.calls[2][0]).toContain("UPDATE user_currencies SET removed_at");
    expect(mockClient.query.mock.calls[2][1]).toContain("PLN");
    expect(mockClient.query.mock.calls[3][0]).toContain("INSERT INTO user_currencies");
    expect(mockClient.query.mock.calls[3][1]).toContain("GBP");
    expect(mockClient.query.mock.calls[4][0]).toBe("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("initUserCurrenciesFromHeaders", () => {
  it("inserts currencies when user has no records", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // COUNT
      .mockResolvedValueOnce({}) // INSERT PLN
      .mockResolvedValueOnce({}); // INSERT EUR

    await initUserCurrenciesFromHeaders("user@test.com", ["PLN", "EUR"]);

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO user_currencies");
  });

  it("skips insert when user already has records", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "2" }] });

    await initUserCurrenciesFromHeaders("user@test.com", ["PLN", "EUR"]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("syncCurrenciesFromSheet", () => {
  it("hard-deletes DB currencies absent from sheet and inserts new ones", async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ currency_code: "PLN" }, { currency_code: "BYN" }],
      }) // SELECT current
      .mockResolvedValueOnce({}) // DELETE BYN
      .mockResolvedValueOnce({}) // INSERT EUR
      .mockResolvedValueOnce({}); // COMMIT

    await syncCurrenciesFromSheet("user@test.com", ["PLN", "EUR"]);

    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe("BEGIN");
    const deleteCall = calls.find((q) => typeof q === "string" && q.includes("DELETE FROM user_currencies"));
    expect(deleteCall).toBeTruthy();
    const insertCall = calls.find((q) => typeof q === "string" && q.includes("INSERT INTO user_currencies"));
    expect(insertCall).toBeTruthy();
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("is a no-op when sheet and DB match", async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ currency_code: "PLN" }] }) // SELECT current
      .mockResolvedValueOnce({}); // COMMIT

    await syncCurrenciesFromSheet("user@test.com", ["PLN"]);

    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain(expect.stringContaining("DELETE"));
    expect(calls).not.toContain(expect.stringContaining("INSERT"));
  });
});

describe("syncCustomColumnsFromSheet", () => {
  it("hard-deletes DB columns absent from sheet and inserts new ones", async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          { id: 1, column_name: "SpentFor" },
          { id: 2, column_name: "OldCol" },
        ],
      }) // SELECT current
      .mockResolvedValueOnce({}) // DELETE OldCol
      .mockResolvedValueOnce({}) // UPDATE SpentFor position
      .mockResolvedValueOnce({}) // INSERT Channel
      .mockResolvedValueOnce({}); // COMMIT

    await syncCustomColumnsFromSheet("user@test.com", ["SpentFor", "Channel"]);

    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe("BEGIN");
    const deleteCall = calls.find((q) => typeof q === "string" && q.includes("DELETE FROM user_custom_columns"));
    expect(deleteCall).toBeTruthy();
    const insertCall = calls.find((q) => typeof q === "string" && q.includes("INSERT INTO user_custom_columns"));
    expect(insertCall).toBeTruthy();
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("updates casing when sheet name differs from DB name", async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 3, column_name: "spentfor" }] }) // SELECT
      .mockResolvedValueOnce({}) // UPDATE (casing + position)
      .mockResolvedValueOnce({}); // COMMIT

    await syncCustomColumnsFromSheet("user@test.com", ["SpentFor"]);

    const updateCall = mockClient.query.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("SET column_name"),
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toContain("SpentFor");
  });
});

describe("getActiveCustomColumns", () => {
  it("returns active columns ordered by position", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 1, column_name: "SpentFor", position: 1 },
        { id: 2, column_name: "Channel", position: 2 },
      ],
    });

    const result = await getActiveCustomColumns("user@test.com");
    expect(result).toEqual([
      { id: 1, name: "SpentFor", position: 1 },
      { id: 2, name: "Channel", position: 2 },
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain("removed_at IS NULL");
  });

  it("returns empty array when no columns exist", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await getActiveCustomColumns("user@test.com");
    expect(result).toEqual([]);
  });
});

describe("initCustomColumnsFromHeaders", () => {
  it("inserts columns when user has none", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValue({});

    await initCustomColumnsFromHeaders("user@test.com", ["SpentFor", "Channel", "Theme"]);

    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO user_custom_columns");
  });

  it("skips when user already has columns", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "3" }] });
    await initCustomColumnsFromHeaders("user@test.com", ["SpentFor"]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("addCustomColumn", () => {
  it("inserts and returns the new column", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 5, column_name: "MyCol", position: 3 }],
    });

    const result = await addCustomColumn("user@test.com", "MyCol", 3);
    expect(result).toEqual({ id: 5, name: "MyCol", position: 3 });
    expect(mockQuery.mock.calls[0][0]).toContain("INSERT INTO user_custom_columns");
  });
});

describe("renameCustomColumn", () => {
  it("updates column name and returns updated column", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 5, column_name: "NewName", position: 3 }],
    });

    const result = await renameCustomColumn("user@test.com", 5, "NewName");
    expect(result).toEqual({ id: 5, name: "NewName", position: 3 });
    expect(mockQuery.mock.calls[0][0]).toContain("UPDATE user_custom_columns");
  });

  it("throws when column not found", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(renameCustomColumn("user@test.com", 99, "X")).rejects.toThrow("Column not found.");
  });
});

describe("reorderCustomColumns", () => {
  it("updates position for each id in a transaction", async () => {
    mockClient.query.mockResolvedValue({});

    await reorderCustomColumns("user@test.com", [3, 1, 2]);

    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toContain("UPDATE user_custom_columns SET position");
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });
});

describe("removeCustomColumn", () => {
  it("soft-deletes the column", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 5 }] });

    await removeCustomColumn("user@test.com", 5);

    expect(mockQuery.mock.calls[0][0]).toContain("removed_at = now()");
  });

  it("throws when column not found", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(removeCustomColumn("user@test.com", 99)).rejects.toThrow("Column not found.");
  });
});
