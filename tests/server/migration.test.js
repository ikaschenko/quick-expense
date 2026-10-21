// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migration = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app-server/db/014_admin_usage_tracking.sql"), "utf8");

describe("014 admin usage tracking migration", () => {
  it("uses the account creation timestamp as the only historical sign-in baseline", () => {
    expect(migration).toContain("UPDATE users SET first_signed_in_at = created_at");
    expect(migration).not.toMatch(/UPDATE users SET connection_validated_at/i);
    expect(migration).toContain("Do not promote historical spreadsheet IDs");
  });

  it("persists only daily account activity and identity-free daily session totals", () => {
    expect(migration).toContain("CREATE TABLE user_activity_days");
    expect(migration).toContain("PRIMARY KEY (user_id, activity_date)");
    expect(migration).toContain("CREATE TABLE usage_session_days");
    const dailySessionTable = migration.match(/CREATE TABLE usage_session_days \(([\s\S]*?)\);/)?.[1] ?? "";
    expect(dailySessionTable).not.toContain("user_id");
    expect(migration).toContain("CREATE TABLE usage_event_receipts");
    expect(migration).toContain("CREATE TABLE usage_tracking_gaps");
  });

  it("enables RLS and revokes PostgREST roles from usage data", () => {
    expect(migration).toContain("ALTER TABLE user_activity_days ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
  });
});
