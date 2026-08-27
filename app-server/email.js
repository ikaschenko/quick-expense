import { Resend } from "resend";
import { shareGrantedEmail, shareRevokedEmail, errorAlertEmail, warningDigestEmail } from "./email-templates.js";

const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim();
const alertRecipients = (process.env.ALERT_EMAIL_TO?.trim() || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);

// If either env var is absent, email sending is disabled. The app runs normally.
const resend = apiKey && from ? new Resend(apiKey) : null;

if (!resend) {
  console.warn(
    JSON.stringify({ level: "warn", event: "email_disabled", reason: "RESEND_API_KEY or EMAIL_FROM not configured" }),
  );
}

async function send({ to, cc, replyTo, subject, html, text }) {
  if (!resend) return;
  try {
    await resend.emails.send({ from, to, cc, replyTo, subject, html, text });
  } catch (err) {
    // Intentionally console-only: routing through winston would trigger another alert email for this failure.
    console.error(
      JSON.stringify({ level: "error", event: "email_send_failed", to, subject, error: err.message }),
    );
  }
}

/**
 * Notifies a guest that the owner has shared their setup with them.
 * Fire-and-forget — do NOT await this call.
 */
export function sendShareGrantedEmail({ ownerEmail, ownerName, guestEmail }) {
  const { subject, html, text } = shareGrantedEmail({ ownerName });
  void send({ to: guestEmail, cc: ownerEmail, replyTo: ownerEmail, subject, html, text });
}

/**
 * Notifies a guest that the owner has revoked their access.
 * Fire-and-forget — do NOT await this call.
 */
export function sendShareRevokedEmail({ ownerEmail, guestEmail }) {
  const { subject, html, text } = shareRevokedEmail();
  void send({ to: guestEmail, cc: ownerEmail, replyTo: ownerEmail, subject, html, text });
}

/**
 * Alerts admins that an error-level log entry was recorded.
 * Fire-and-forget — do NOT await this call. Silently skipped when ALERT_EMAIL_TO is unset.
 */
export function sendErrorAlertEmail({ message, event, requestId, userId, ownerUserId, timestamp, error, stack, path, method, statusCode }) {
  if (alertRecipients.length === 0) return;
  const { subject, html, text } = errorAlertEmail({ message, event, requestId, userId, ownerUserId, timestamp, error, stack, path, method, statusCode });
  void send({ to: alertRecipients, subject, html, text });
}

/**
 * Sends admins a digest of warnings accumulated since the last digest window.
 * Fire-and-forget — do NOT await this call. Silently skipped when ALERT_EMAIL_TO is unset.
 */
export function sendWarningDigestEmail({ count, since, samples }) {
  if (alertRecipients.length === 0) return;
  const { subject, html, text } = warningDigestEmail({ count, since, samples });
  void send({ to: alertRecipients, subject, html, text });
}
