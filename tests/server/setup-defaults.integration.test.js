// Resource: disposable qe_defaults_* PostgreSQL schema; requires DATABASE_URL.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const database = vi.hoisted(() => ({ pool: null }));
vi.mock("../../app-server/db.js", () => ({ default: database.pool }));

const schema = `qe_defaults_${randomUUID().replaceAll("-", "")}`;
let ownerId;
let store;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("Defaults integration tests require DATABASE_URL in .env.");
  database.pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
  await database.pool.query(`CREATE SCHEMA ${schema}`);
  await database.pool.query(`CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    spreadsheet_id TEXT
  )`);
  const migration = await readFile(new URL("../../app-server/db/013_setup_field_defaults.sql", import.meta.url), "utf8");
  await database.pool.query(migration);
  store = await import("../../app-server/store.js");
}, 30000);

afterAll(async () => {
  if (database.pool) {
    try { await database.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await database.pool.end(); }
  }
});

beforeEach(async () => {
  await database.pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  const { rows } = await database.pool.query("INSERT INTO users (email, spreadsheet_id) VALUES ($1, $2) RETURNING id", ["defaults-test@example.invalid", "sheet-1"]);
  ownerId = Number(rows[0].id);
});

function changeDefault(expectedVersion, values) {
  return store.withSetupDefaultsLock(ownerId, "sheet-1", (client, snapshot) => {
    if (snapshot.version !== expectedVersion) throw store.defaultsConflict();
    return store.writeSetupDefaults(client, ownerId, values);
  });
}

describe("setup defaults PostgreSQL concurrency", () => {
  it("allows exactly one simultaneous same-version writer", async () => {
    const results = await Promise.allSettled([
      changeDefault("0", { "Spent For": "Family" }),
      changeDefault("0", { Theme: "Vacation" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toMatchObject({ status: 409, code: "DEFAULTS_CONFLICT" });
    expect((await store.getSetupDefaults(ownerId, "sheet-1")).version).toBe("1");
  });

  it("retains its version after the final default is cleared", async () => {
    await changeDefault("0", { Theme: "Vacation" });
    expect(await changeDefault("1", {})).toEqual({ version: "2", values: {} });
    await expect(changeDefault("0", { Theme: "Old" })).rejects.toMatchObject({ code: "DEFAULTS_CONFLICT" });
  });

  it("clears defaults and advances the version on switch and unlink, but not same-sheet updates", async () => {
    await changeDefault("0", { Theme: "Vacation" });
    await database.pool.query("UPDATE users SET spreadsheet_id = $1 WHERE id = $2", ["sheet-1", ownerId]);
    expect((await store.getSetupDefaults(ownerId, "sheet-1")).version).toBe("1");
    await database.pool.query("UPDATE users SET spreadsheet_id = $1 WHERE id = $2", ["sheet-2", ownerId]);
    expect(await store.getSetupDefaults(ownerId, "sheet-2")).toEqual({ version: "2", values: {} });
    await expect(changeDefault("1", { Theme: "Stale" })).rejects.toMatchObject({ code: "DEFAULTS_CONFLICT" });
    await database.pool.query("UPDATE users SET spreadsheet_id = NULL WHERE id = $1", [ownerId]);
    expect(await store.getSetupDefaults(ownerId, null)).toEqual({ version: "3", values: {} });
  });

  it("clears an in-flight old-sheet mutation when a relink follows it", async () => {
    let unlock;
    let entered;
    const locked = new Promise((resolve) => { entered = resolve; });
    const release = new Promise((resolve) => { unlock = resolve; });
    const mutation = store.withSetupDefaultsLock(ownerId, "sheet-1", async (client) => {
      entered();
      await release;
      return store.writeSetupDefaults(client, ownerId, { Theme: "Old setup" });
    });
    await locked;
    const relink = database.pool.query("UPDATE users SET spreadsheet_id = $1 WHERE id = $2", ["sheet-2", ownerId]);
    unlock();
    await Promise.all([mutation, relink]);
    expect(await store.getSetupDefaults(ownerId, "sheet-2")).toEqual({ version: "2", values: {} });
  });

  it("keeps owners isolated and removes defaults when an owner is deleted", async () => {
    await changeDefault("0", { Theme: "Private setup" });
    const { rows } = await database.pool.query("INSERT INTO users (email, spreadsheet_id) VALUES ($1, $2) RETURNING id", ["other@example.invalid", "sheet-1"]);
    expect(await store.getSetupDefaults(Number(rows[0].id), "sheet-1")).toEqual({ version: "0", values: {} });
    await database.pool.query("DELETE FROM users WHERE id = $1", [ownerId]);
    await expect(store.getSetupDefaults(ownerId, "sheet-1")).rejects.toMatchObject({ code: "DEFAULTS_CONFLICT" });
  });
});