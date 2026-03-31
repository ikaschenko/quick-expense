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

export async function saveFxRateBackup(email, spreadsheetId, backup) {
  const normalizedEmail = email.toLowerCase();
  const submittedAt = new Date().toISOString();
  const currencies = ["PLN", "BYN", "EUR"];

  for (const code of currencies) {
    const rateStr = backup.rates?.[code];
    if (!rateStr) continue;

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

  const rates = { PLN: null, BYN: null, EUR: null };
  for (const row of rows) {
    rates[row.currency_code] = String(row.fx_rate);
  }

  return { rates };
}
