// @vitest-environment node
const mockQuery = vi.fn();

vi.mock("../server/db.js", () => ({
  default: {
    query: (...args) => mockQuery(...args),
  },
}));

let getShareForGuest;
let listSharesForOwner;
let addShare;
let updateShareAccessLevel;
let removeShare;
let removeShareAsGuest;

beforeAll(async () => {
  ({
    getShareForGuest,
    listSharesForOwner,
    addShare,
    updateShareAccessLevel,
    removeShare,
    removeShareAsGuest,
  } = await import("../server/sharing.js"));
});

beforeEach(() => {
  mockQuery.mockReset();
});

describe("getShareForGuest", () => {
  it("returns null when no share exists", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getShareForGuest("guest@test.com");

    expect(result).toBeNull();
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT owner_email, access_level FROM setup_shares WHERE guest_email = $1",
      ["guest@test.com"],
    );
  });

  it("returns ownerEmail and accessLevel when a share exists", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ owner_email: "owner@test.com", access_level: "edit" }],
    });

    const result = await getShareForGuest("guest@test.com");

    expect(result).toEqual({ ownerEmail: "owner@test.com", accessLevel: "edit" });
  });

  it("normalises the guest email to lowercase", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await getShareForGuest("Guest@Test.COM");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["guest@test.com"],
    );
  });
});

describe("listSharesForOwner", () => {
  it("returns an empty array when there are no shares", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await listSharesForOwner("owner@test.com");

    expect(result).toEqual([]);
  });

  it("maps rows to ShareEntry objects", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { guest_email: "a@test.com", access_level: "edit" },
        { guest_email: "b@test.com", access_level: "view" },
      ],
    });

    const result = await listSharesForOwner("owner@test.com");

    expect(result).toEqual([
      { guestEmail: "a@test.com", accessLevel: "edit" },
      { guestEmail: "b@test.com", accessLevel: "view" },
    ]);
  });
});

describe("addShare", () => {
  it("inserts a new share row", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await addShare("owner@test.com", "guest@test.com", "view");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO setup_shares"),
      ["owner@test.com", "guest@test.com", "view"],
    );
  });

  it("normalises emails to lowercase on insert", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await addShare("Owner@Test.COM", "Guest@Test.COM", "edit");

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe("owner@test.com");
    expect(params[1]).toBe("guest@test.com");
  });
});

describe("updateShareAccessLevel", () => {
  it("returns true when a row was updated", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const result = await updateShareAccessLevel("owner@test.com", "guest@test.com", "view");

    expect(result).toBe(true);
  });

  it("returns false when the share was not found", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });

    const result = await updateShareAccessLevel("owner@test.com", "nobody@test.com", "edit");

    expect(result).toBe(false);
  });
});

describe("removeShare", () => {
  it("returns true when a row was deleted", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const result = await removeShare("owner@test.com", "guest@test.com");

    expect(result).toBe(true);
  });

  it("returns false when the share was not found", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });

    const result = await removeShare("owner@test.com", "nobody@test.com");

    expect(result).toBe(false);
  });
});

describe("removeShareAsGuest", () => {
  it("deletes the share for the given guest email", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await removeShareAsGuest("guest@test.com");

    expect(mockQuery).toHaveBeenCalledWith(
      "DELETE FROM setup_shares WHERE guest_email = $1",
      ["guest@test.com"],
    );
  });
});
