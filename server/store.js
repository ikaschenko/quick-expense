import pool from "./db.js";

function rowToUserRecord(row) {
  return {
    email: row.email,
    accessToken: row.access_token,
    accessTokenExpiresAt: Number(row.access_token_expires_at),
    refreshToken: row.refresh_token,
    spreadsheetUrl: row.spreadsheet_url,
    spreadsheetId: row.spreadsheet_id,
    lastAuthenticatedAt: Number(row.last_authenticated_at),
    lastActivityAt: Number(row.last_activity_at),
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

  await pool.query(
    `INSERT INTO users (email, access_token, access_token_expires_at, refresh_token,
                        spreadsheet_url, spreadsheet_id, last_authenticated_at, last_activity_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (email) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token = EXCLUDED.refresh_token,
       spreadsheet_url = EXCLUDED.spreadsheet_url,
       spreadsheet_id = EXCLUDED.spreadsheet_id,
       last_authenticated_at = EXCLUDED.last_authenticated_at,
       last_activity_at = EXCLUDED.last_activity_at,
       updated_at = now()`,
    [
      normalizedEmail,
      next.accessToken,
      next.accessTokenExpiresAt,
      next.refreshToken ?? null,
      next.spreadsheetUrl ?? null,
      next.spreadsheetId ?? null,
      next.lastAuthenticatedAt,
      next.lastActivityAt,
    ],
  );

  return next;
}

export async function getActiveUserCurrencies(email) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `SELECT currency_code FROM user_currencies
     WHERE user_email = $1 AND removed_at IS NULL
     ORDER BY added_at`,
    [normalizedEmail],
  );
  return rows.map((row) => row.currency_code);
}

export async function setUserCurrencies(email, codes) {
  const normalizedEmail = email.toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: currentRows } = await client.query(
      `SELECT currency_code FROM user_currencies
       WHERE user_email = $1 AND removed_at IS NULL`,
      [normalizedEmail],
    );
    const currentCodes = new Set(currentRows.map((r) => r.currency_code));
    const desiredCodes = new Set(codes);

    // Mark removed currencies
    for (const code of currentCodes) {
      if (!desiredCodes.has(code)) {
        await client.query(
          `UPDATE user_currencies SET removed_at = now()
           WHERE user_email = $1 AND currency_code = $2 AND removed_at IS NULL`,
          [normalizedEmail, code],
        );
      }
    }

    // Insert new currencies
    for (const code of codes) {
      if (!currentCodes.has(code)) {
        await client.query(
          `INSERT INTO user_currencies (user_email, currency_code)
           VALUES ($1, $2)`,
          [normalizedEmail, code],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function initUserCurrenciesFromHeaders(email, codes) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM user_currencies WHERE user_email = $1`,
    [normalizedEmail],
  );
  if (Number(rows[0].count) > 0) return;

  for (const code of codes) {
    await pool.query(
      `INSERT INTO user_currencies (user_email, currency_code) VALUES ($1, $2)`,
      [normalizedEmail, code],
    );
  }
}

export async function syncCurrenciesFromSheet(email, sheetCurrencies) {
  const normalizedEmail = email.toLowerCase();
  const sheetSet = new Set(sheetCurrencies);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: currentRows } = await client.query(
      `SELECT currency_code FROM user_currencies
       WHERE user_email = $1 AND removed_at IS NULL`,
      [normalizedEmail],
    );
    const currentSet = new Set(currentRows.map((r) => r.currency_code));

    // Hard-delete currencies present in DB but absent from sheet
    for (const code of currentSet) {
      if (!sheetSet.has(code)) {
        await client.query(
          `DELETE FROM user_currencies WHERE user_email = $1 AND currency_code = $2`,
          [normalizedEmail, code],
        );
      }
    }

    // Insert currencies present in sheet but absent from DB
    for (const code of sheetCurrencies) {
      if (!currentSet.has(code)) {
        await client.query(
          `INSERT INTO user_currencies (user_email, currency_code) VALUES ($1, $2)`,
          [normalizedEmail, code],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Custom Columns ───────────────────────────────────────────────────────────

export async function syncCustomColumnsFromSheet(email, sheetCustomColumns) {
  const normalizedEmail = email.toLowerCase();
  // Build a map of lowercase name → exact sheet name (for case-sync)
  const sheetMap = new Map(sheetCustomColumns.map((name) => [name.toLowerCase(), name]));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: currentRows } = await client.query(
      `SELECT id, column_name FROM user_custom_columns
       WHERE user_email = $1 AND removed_at IS NULL`,
      [normalizedEmail],
    );
    const currentMap = new Map(currentRows.map((r) => [r.column_name.toLowerCase(), r]));

    // Hard-delete DB entries absent from sheet (by case-insensitive name)
    for (const [lowerName, row] of currentMap) {
      if (!sheetMap.has(lowerName)) {
        await client.query(
          `DELETE FROM user_custom_columns WHERE id = $1`,
          [row.id],
        );
      }
    }

    // Insert sheet entries absent from DB; update name casing if needed
    for (let i = 0; i < sheetCustomColumns.length; i++) {
      const sheetName = sheetCustomColumns[i];
      const lowerName = sheetName.toLowerCase();
      const existing = currentMap.get(lowerName);
      if (!existing) {
        await client.query(
          `INSERT INTO user_custom_columns (user_email, column_name, position) VALUES ($1, $2, $3)`,
          [normalizedEmail, sheetName, i + 1],
        );
      } else if (existing.column_name !== sheetName) {
        // Sync exact casing from sheet and update position
        await client.query(
          `UPDATE user_custom_columns SET column_name = $1, position = $2 WHERE id = $3`,
          [sheetName, i + 1, existing.id],
        );
      } else {
        // Keep name, just ensure position is up to date
        await client.query(
          `UPDATE user_custom_columns SET position = $1 WHERE id = $2`,
          [i + 1, existing.id],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveCustomColumns(email) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `SELECT id, column_name, position FROM user_custom_columns
     WHERE user_email = $1 AND removed_at IS NULL
     ORDER BY position`,
    [normalizedEmail],
  );
  return rows.map((r) => ({ id: r.id, name: r.column_name, position: r.position }));
}

export async function initCustomColumnsFromHeaders(email, columnNames) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM user_custom_columns WHERE user_email = $1`,
    [normalizedEmail],
  );
  if (Number(rows[0].count) > 0) return;

  for (let i = 0; i < columnNames.length; i++) {
    await pool.query(
      `INSERT INTO user_custom_columns (user_email, column_name, position) VALUES ($1, $2, $3)`,
      [normalizedEmail, columnNames[i], i + 1],
    );
  }
}

export async function addCustomColumn(email, columnName, position) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO user_custom_columns (user_email, column_name, position)
     VALUES ($1, $2, $3) RETURNING id, column_name, position`,
    [normalizedEmail, columnName, position],
  );
  const r = rows[0];
  return { id: r.id, name: r.column_name, position: r.position };
}

export async function renameCustomColumn(email, id, newName) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `UPDATE user_custom_columns SET column_name = $1
     WHERE id = $2 AND user_email = $3 AND removed_at IS NULL
     RETURNING id, column_name, position`,
    [newName, id, normalizedEmail],
  );
  if (rows.length === 0) throw new Error("Column not found.");
  const r = rows[0];
  return { id: r.id, name: r.column_name, position: r.position };
}

export async function reorderCustomColumns(email, orderedIds) {
  const normalizedEmail = email.toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE user_custom_columns SET position = $1
         WHERE id = $2 AND user_email = $3 AND removed_at IS NULL`,
        [i + 1, orderedIds[i], normalizedEmail],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function removeCustomColumn(email, id) {
  const normalizedEmail = email.toLowerCase();
  const { rows } = await pool.query(
    `UPDATE user_custom_columns SET removed_at = now()
     WHERE id = $1 AND user_email = $2 AND removed_at IS NULL
     RETURNING id`,
    [id, normalizedEmail],
  );
  if (rows.length === 0) throw new Error("Column not found.");
}

// ─── FX Rate Backups ──────────────────────────────────────────────────────────

export async function saveFxRateBackup(email, spreadsheetId, backup) {
  const normalizedEmail = email.toLowerCase();
  const submittedAt = new Date().toISOString();

  for (const [code, rateStr] of Object.entries(backup.rates ?? {})) {
    if (!rateStr || typeof code !== "string" || code.length !== 3) continue;

    const numericRate = Number(String(rateStr).replace(",", "."));
    if (Number.isNaN(numericRate) || numericRate <= 0) continue;

    await pool.query(
      `INSERT INTO fx_rate_backups (user_email, spreadsheet_id, expense_date, currency_code, fx_rate, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [normalizedEmail, spreadsheetId, backup.expenseDate, code, numericRate, submittedAt],
    );
  }
}

export async function getLatestFxRateBackup(email, spreadsheetId) {
  const normalizedEmail = email.toLowerCase();

  const { rows } = await pool.query(
    `SELECT currency_code, fx_rate
     FROM fx_rate_backups
     WHERE user_email = $1
       AND (spreadsheet_id IS NULL OR spreadsheet_id = $2)
       AND submitted_at = (
         SELECT MAX(submitted_at) FROM fx_rate_backups
         WHERE user_email = $1
           AND (spreadsheet_id IS NULL OR spreadsheet_id = $2)
       )`,
    [normalizedEmail, spreadsheetId],
  );

  if (rows.length === 0) return null;

  const rates = {};
  for (const row of rows) {
    rates[row.currency_code] = String(row.fx_rate);
  }

  return { rates };
}
