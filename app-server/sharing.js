import pool from "./db.js";

// ─── Setup Sharing ────────────────────────────────────────────────────────────

/**
 * Resolves the share record for a guest email.
 * @returns {{ ownerEmail: string, accessLevel: 'view' | 'edit' } | null}
 */
export async function getShareForGuest(guestEmail) {
  const { rows } = await pool.query(
    "SELECT owner_email, access_level FROM setup_shares WHERE guest_email = $1",
    [guestEmail.toLowerCase()],
  );
  if (rows.length === 0) return null;
  return { ownerEmail: rows[0].owner_email, accessLevel: rows[0].access_level };
}

/**
 * Lists all shares owned by a given owner email.
 * @returns {{ guestEmail: string, accessLevel: 'view' | 'edit' }[]}
 */
export async function listSharesForOwner(ownerEmail) {
  const { rows } = await pool.query(
    "SELECT guest_email, access_level FROM setup_shares WHERE owner_email = $1 ORDER BY created_at ASC",
    [ownerEmail.toLowerCase()],
  );
  return rows.map((r) => ({ guestEmail: r.guest_email, accessLevel: r.access_level }));
}

/**
 * Adds a new share.  Throws on duplicate (unique constraint), caller should catch and map to 409.
 */
export async function addShare(ownerEmail, guestEmail, accessLevel) {
  await pool.query(
    `INSERT INTO setup_shares (owner_email, guest_email, access_level)
     VALUES ($1, $2, $3)`,
    [ownerEmail.toLowerCase(), guestEmail.toLowerCase(), accessLevel],
  );
}

/**
 * Updates the access level for an existing share.
 * @returns {boolean} true if a row was updated, false if not found.
 */
export async function updateShareAccessLevel(ownerEmail, guestEmail, accessLevel) {
  const { rowCount } = await pool.query(
    `UPDATE setup_shares SET access_level = $3, updated_at = now()
     WHERE owner_email = $1 AND guest_email = $2`,
    [ownerEmail.toLowerCase(), guestEmail.toLowerCase(), accessLevel],
  );
  return rowCount > 0;
}

/**
 * Removes a share by owner + guest pair.
 * @returns {boolean} true if a row was deleted.
 */
export async function removeShare(ownerEmail, guestEmail) {
  const { rowCount } = await pool.query(
    "DELETE FROM setup_shares WHERE owner_email = $1 AND guest_email = $2",
    [ownerEmail.toLowerCase(), guestEmail.toLowerCase()],
  );
  return rowCount > 0;
}

/**
 * Removes a guest's own share entry (used in the guest-initiated reset flow).
 */
export async function removeShareAsGuest(guestEmail) {
  await pool.query("DELETE FROM setup_shares WHERE guest_email = $1", [guestEmail.toLowerCase()]);
}
