import { escapeHtml } from "./utils.js";

const APP_URL = "https://app.q-expense.com";

function wrapHtml(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:40px auto;padding:0 20px;line-height:1.6">
  ${body}
  <p style="margin-top:32px">Regards,<br><strong>QuickExpense</strong></p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0">
  <p style="font-size:12px;color:#888">You received this email because someone used <a href="${APP_URL}">QuickExpense</a>.</p>
</body>
</html>`;
}

/**
 * Email sent to a guest when an owner shares their setup with them.
 * @param {{ ownerName: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function shareGrantedEmail({ ownerName }) {
  const safeName = escapeHtml(ownerName);
  const subject = "Application setup shared with you";
  const html = wrapHtml(`
    <p>Hello,</p>
    <p>You've been granted access to the QuickExpense application setup by <strong>${safeName}</strong>.</p>
    <p><a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Open QuickExpense →</a></p>
  `);
  const text = `Hello,\n\nYou've been granted access to the QuickExpense application setup by ${ownerName}.\n\nOpen the app: ${APP_URL}\n\nRegards,\nQuickExpense`;
  return { subject, html, text };
}

/**
 * Email sent to a guest when an owner revokes their access.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function shareRevokedEmail() {
  const subject = "Shared setup was revoked from you";
  const html = wrapHtml(`
    <p>Hello,</p>
    <p>The previously shared QuickExpense setup has been revoked. You can always set up your own.</p>
    <p><a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Open QuickExpense →</a></p>
  `);
  const text = `Hello,\n\nThe previously shared QuickExpense setup has been revoked. You can always set up your own.\n\nOpen the app: ${APP_URL}\n\nRegards,\nQuickExpense`;
  return { subject, html, text };
}

function subjectPrefix() {
  return process.env.ALERT_EMAIL_SUBJECT_PREFIX?.trim() || "[QuickExpense Alert]";
}

/**
 * Email sent to admins when an error-level log entry is recorded.
 * @param {{ message: string, event?: string, requestId?: string, timestamp?: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function errorAlertEmail({ message, event, requestId, timestamp, error, stack, path, method, statusCode }) {
  const subject = `${subjectPrefix()} Error: ${event ?? "unknown"}`;
  const requestLine = method && path ? `${escapeHtml(String(method))} ${escapeHtml(String(path))}` : null;
  const html = wrapHtml(`
    <p>An error was logged on QuickExpense.</p>
    <p><strong>Event:</strong> ${escapeHtml(String(event ?? ""))}</p>
    <p><strong>Message:</strong> ${escapeHtml(String(message ?? ""))}</p>
    ${error != null ? `<p><strong>Error detail:</strong> ${escapeHtml(String(error))}</p>` : ""}
    ${requestLine != null ? `<p><strong>Request:</strong> ${requestLine}${statusCode != null ? ` — ${escapeHtml(String(statusCode))}` : ""}</p>` : ""}
    <p><strong>Request ID:</strong> ${escapeHtml(String(requestId ?? ""))}</p>
    <p><strong>Time:</strong> ${escapeHtml(String(timestamp ?? ""))}</p>
    ${stack ? `<p><strong>Stack trace:</strong></p><pre style="white-space:pre-wrap;word-break:break-word;background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px">${escapeHtml(String(stack))}</pre>` : ""}
  `);
  const textParts = [
    `An error was logged on QuickExpense.`,
    ``,
    `Event: ${event ?? ""}`,
    `Message: ${message ?? ""}`,
    ...(error != null ? [`Error detail: ${error}`] : []),
    ...(requestLine != null ? [`Request: ${method} ${path}${statusCode != null ? ` — ${statusCode}` : ""}`] : []),
    `Request ID: ${requestId ?? ""}`,
    `Time: ${timestamp ?? ""}`,
    ...(stack ? [``, `Stack trace:`, stack] : []),
  ];
  return { subject, html, text: textParts.join("\n") };
}

/**
 * Email sent to admins summarizing warnings accumulated since the last digest.
 * @param {{ count: number, since: string, samples?: string[] }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function warningDigestEmail({ count, since, samples = [] }) {
  const subject = `${subjectPrefix()} ${count} warning${count === 1 ? "" : "s"} since last digest`;
  const sampleItems = samples.map((s) => `<li>${escapeHtml(String(s))}</li>`).join("");
  const html = wrapHtml(`
    <p>${count} warning${count === 1 ? "" : "s"} were logged on QuickExpense since ${escapeHtml(String(since ?? ""))}.</p>
    ${samples.length > 0 ? `<p><strong>Recent samples:</strong></p><ul>${sampleItems}</ul>` : ""}
  `);
  const text = `${count} warning(s) were logged on QuickExpense since ${since ?? ""}.\n\n${samples.map((s) => `- ${s}`).join("\n")}`;
  return { subject, html, text };
}
