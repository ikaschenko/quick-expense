import pool from "./db.js";

export function defaultsConflict() {
  return Object.assign(new Error("Defaults changed. Reload the page before trying again."), {
    status: 409,
    code: "DEFAULTS_CONFLICT",
  });
}

function defaultsSnapshot(row, spreadsheetId) {
  if (!row || row.spreadsheet_id !== spreadsheetId) throw defaultsConflict();
  return { version: String(row.version), values: row.values };
}

export async function getSetupDefaults(ownerUserId, spreadsheetId) {
  const { rows } = await pool.query(
    "SELECT spreadsheet_id, values, version FROM setup_field_defaults WHERE owner_user_id = $1",
    [ownerUserId],
  );
  return defaultsSnapshot(rows[0], spreadsheetId);
}

export async function withSetupDefaultsLock(ownerUserId, spreadsheetId, action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT spreadsheet_id, values, version FROM setup_field_defaults WHERE owner_user_id = $1 FOR UPDATE",
      [ownerUserId],
    );
    const snapshot = defaultsSnapshot(rows[0], spreadsheetId);
    const result = await action(client, snapshot);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function writeSetupDefaults(client, ownerUserId, values) {
  const { rows } = await client.query(
    "UPDATE setup_field_defaults SET values = $2::jsonb, version = version + 1 WHERE owner_user_id = $1 RETURNING spreadsheet_id, values, version",
    [ownerUserId, JSON.stringify(values)],
  );
  return { version: String(rows[0].version), values: rows[0].values };
}

function rowToUserRecord(row) {
  return {
    id: Number(row.id),
    email: row.email,
    accessToken: row.access_token,
    accessTokenExpiresAt: Number(row.access_token_expires_at),
    refreshToken: row.refresh_token,
    spreadsheetUrl: row.spreadsheet_url,
    spreadsheetId: row.spreadsheet_id,
    lastAuthenticatedAt: Number(row.last_authenticated_at),
    lastActivityAt: Number(row.last_activity_at),
    firstSignedInAt: row.first_signed_in_at,
    connectionValidatedAt: row.connection_validated_at,
    connectionOrigin: row.connection_origin,
  };
}

export async function getUserRecord(email) {
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return rows.length > 0 ? rowToUserRecord(rows[0]) : null;
}

export async function updateUserRecord(email, updater) {
  const normalizedEmail = email.toLowerCase();
  const current = await getUserRecord(normalizedEmail);
  const base = current ?? { email: normalizedEmail };
  const next = updater(base);
  next.firstSignedInAt = current?.firstSignedInAt ?? next.firstSignedInAt ?? new Date();
  next.connectionValidatedAt = current?.connectionValidatedAt ?? next.connectionValidatedAt ?? null;
  next.connectionOrigin = current?.connectionOrigin ?? next.connectionOrigin ?? null;

  const { rows } = await pool.query(
    `INSERT INTO users (email, access_token, access_token_expires_at, refresh_token,
                        spreadsheet_url, spreadsheet_id, last_authenticated_at, last_activity_at,
                        first_signed_in_at, connection_validated_at, connection_origin, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (email) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token = EXCLUDED.refresh_token,
       spreadsheet_url = CASE WHEN $12 THEN EXCLUDED.spreadsheet_url ELSE users.spreadsheet_url END,
       spreadsheet_id = CASE WHEN $12 THEN EXCLUDED.spreadsheet_id ELSE users.spreadsheet_id END,
       last_authenticated_at = EXCLUDED.last_authenticated_at,
       last_activity_at = EXCLUDED.last_activity_at,
       updated_at = now()
     RETURNING id`,

    [
      normalizedEmail,
      next.accessToken,
      next.accessTokenExpiresAt,
      next.refreshToken ?? null,
      next.spreadsheetUrl ?? null,
      next.spreadsheetId ?? null,
      next.lastAuthenticatedAt,
      next.lastActivityAt,
      next.firstSignedInAt,
      next.connectionValidatedAt,
      next.connectionOrigin,
      !!current && (next.spreadsheetId !== current.spreadsheetId || next.spreadsheetUrl !== current.spreadsheetUrl),
    ],
  );

  return { ...next, id: Number(rows[0].id) };
}

export async function reserveConnectionChange(userId) {
  const { rows } = await pool.query(
    "UPDATE users SET connection_revision = connection_revision + 1 WHERE id = $1 RETURNING connection_revision",
    [userId],
  );
  if (!rows[0]) throw new Error("Account is no longer available.");
  return Number(rows[0].connection_revision);
}

export async function saveValidatedConnection(userId, spreadsheetId, spreadsheetUrl, requestedOrigin, expectedRevision = null, expectedCurrentSpreadsheetId = undefined) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [user] } = await client.query("SELECT id, spreadsheet_id, connection_revision FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!user) throw new Error("Account is no longer available.");
    if (expectedRevision !== null && Number(user.connection_revision) !== expectedRevision) {
      await client.query("ROLLBACK");
      return { stale: true };
    }
    if (expectedCurrentSpreadsheetId !== undefined && user.spreadsheet_id !== expectedCurrentSpreadsheetId) {
      await client.query("ROLLBACK");
      return { stale: true };
    }

    const { rows: prior } = await client.query(
      "SELECT origin FROM setup_connection_provenance WHERE user_id = $1 AND spreadsheet_id = $2",
      [userId, spreadsheetId],
    );
    const origin = prior[0]?.origin ?? (
      user.spreadsheet_id === spreadsheetId && requestedOrigin !== "created" ? "unknown" : requestedOrigin
    );
    await client.query(
      `INSERT INTO setup_connection_provenance (user_id, spreadsheet_id, origin)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, spreadsheet_id) DO NOTHING`,
      [userId, spreadsheetId, origin],
    );
    await client.query(
      `UPDATE users SET spreadsheet_id = $2, spreadsheet_url = $3,
         connection_validated_at = now(), connection_origin = $4, updated_at = now()
       WHERE id = $1`,
      [userId, spreadsheetId, spreadsheetUrl, origin],
    );
    await client.query("COMMIT");
    return { origin, stale: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function disconnectValidatedConnection(userId) {
  await pool.query(
    `UPDATE users SET spreadsheet_id = NULL, spreadsheet_url = NULL,
       connection_validated_at = NULL, connection_origin = NULL,
       connection_revision = connection_revision + 1, updated_at = now()
     WHERE id = $1`,
    [userId],
  );
}

// ─── FX Rate Backups ──────────────────────────────────────────────────────────

export async function saveFxRateBackup(userId, spreadsheetId, backup) {
  const submittedAt = new Date().toISOString();

  for (const [code, rateStr] of Object.entries(backup.rates ?? {})) {
    if (!rateStr || typeof code !== "string" || !code || code.length > 10) continue;

    const numericRate = Number(String(rateStr).replace(",", "."));
    if (Number.isNaN(numericRate) || numericRate <= 0) continue;

    await pool.query(
      `INSERT INTO fx_rate_backups (user_id, spreadsheet_id, expense_date, currency_code, fx_rate, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, spreadsheetId, backup.expenseDate, code, numericRate, submittedAt],
    );
  }
}

export async function getLatestFxRateBackup(userId, spreadsheetId) {
  const { rows } = await pool.query(
    `SELECT currency_code, fx_rate
     FROM fx_rate_backups
    WHERE user_id = $1
       AND (spreadsheet_id IS NULL OR spreadsheet_id = $2)
       AND submitted_at = (
         SELECT MAX(submitted_at) FROM fx_rate_backups
         WHERE user_id = $1
           AND (spreadsheet_id IS NULL OR spreadsheet_id = $2)
       )`,
    [userId, spreadsheetId],
  );

  if (rows.length === 0) return null;

  const rates = {};
  for (const row of rows) {
    rates[row.currency_code] = String(row.fx_rate);
  }

  return { rates };
}

// ─── Column Visibility ────────────────────────────────────────────────────────

export async function getHiddenColumns(userId, spreadsheetId) {
  const { rows } = await pool.query(
    `SELECT canonical_field_name FROM user_column_visibility
    WHERE user_id = $1 AND spreadsheet_id = $2`,
      [userId, spreadsheetId],
  );
  return rows.map((r) => r.canonical_field_name);
}

export async function setColumnVisibility(userId, spreadsheetId, fieldName, hidden) {
  if (hidden) {
    await pool.query(
      `INSERT INTO user_column_visibility (user_id, spreadsheet_id, canonical_field_name)
       VALUES ($1, $2, $3)
      ON CONFLICT (user_id, spreadsheet_id, canonical_field_name) DO NOTHING`,
          [userId, spreadsheetId, fieldName],
    );
  } else {
    await pool.query(
      `DELETE FROM user_column_visibility
      WHERE user_id = $1 AND spreadsheet_id = $2 AND canonical_field_name = $3`,
          [userId, spreadsheetId, fieldName],
    );
  }
}

export async function renameVisibilityEntry(userId, spreadsheetId, oldName, newName, client = pool) {
  await client.query(
    `UPDATE user_column_visibility
     SET canonical_field_name = $4
    WHERE user_id = $1 AND spreadsheet_id = $2 AND canonical_field_name = $3`,
      [userId, spreadsheetId, oldName, newName],
  );
}

// ─── Setup Sharing ────────────────────────────────────────────────────────────

/**
 * Returns true if the given email has their own independently configured spreadsheet
 * AND is not already a guest in setup_shares.
 * Used to block owners from sharing with users who have their own setup.
 */
export async function hasOwnIndependentSetup(email) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `SELECT u.spreadsheet_id
     FROM users u
     WHERE u.email = $1
       AND u.spreadsheet_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM setup_shares s WHERE s.guest_email = $1
       )`,
    [normalizedEmail],
  );
  return rows.length > 0;
}
