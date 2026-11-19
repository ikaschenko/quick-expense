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

function singleLine(value, maxLength) {
  const text = String(value).replace(/[\r\n]+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/**
 * Email sent to admins when an error-level log entry is recorded.
 * @param {{ message: string, event?: string, requestId?: string, timestamp?: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function errorAlertEmail({
  message, event, requestId, userId = 0, ownerUserId, timestamp, error, errorType, stack,
  path, method, statusCode, clientIp, userAgent, suppressedCount = 0,
}) {
  const requestText = method && path ? `${method} ${path}${statusCode != null ? ` — ${statusCode}` : ""}` : null;
  const subject = singleLine(
    `${subjectPrefix()} Error: ${event ?? "unknown"}${method && path ? ` — ${method} ${singleLine(path, 80)}` : ""}${errorType ? ` (${errorType})` : ""}`,
    200,
  );
  const fields = [
    ["Event", event ?? ""],
    message != null && message !== event ? ["Message", message] : null,
    error != null ? ["Error detail", `${errorType ? `${errorType}: ` : ""}${error}`] : null,
    requestText ? ["Request", requestText] : null,
    ["Request ID", requestId ?? ""],
    ["User ID", userId ? userId : "anonymous (not signed in)"],
    ownerUserId != null ? ["Owner User ID", ownerUserId] : null,
    clientIp ? ["Client IP", clientIp] : null,
    userAgent ? ["User agent", userAgent] : null,
    ["Time", timestamp ?? ""],
    suppressedCount > 0
      ? ["Suppressed", `${suppressedCount} more error(s) were logged since the previous alert but not emailed (throttled) — check /logs.`]
      : null,
  ].filter(Boolean);
  const html = wrapHtml(`
    <p>An error was logged on QuickExpense.</p>
    ${fields.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(String(value))}</p>`).join("\n    ")}
    ${stack ? `<p><strong>Stack trace:</strong></p><pre style="white-space:pre-wrap;word-break:break-word;background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px">${escapeHtml(String(stack))}</pre>` : ""}
  `);
  const textParts = [
    `An error was logged on QuickExpense.`,
    ``,
    ...fields.map(([label, value]) => `${label}: ${value}`),
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
  const sampleLabel = (sample) => `${sample.message ?? sample}${sample.path ? ` [${sample.path}]` : ""}`;
  const sampleItems = samples.map((sample) => `<li>${escapeHtml(sampleLabel(sample))} (userId: ${escapeHtml(String(sample.userId ?? 0))})</li>`).join("");
  const html = wrapHtml(`
    <p>${count} warning${count === 1 ? "" : "s"} were logged on QuickExpense since ${escapeHtml(String(since ?? ""))}.</p>
    ${samples.length > 0 ? `<p><strong>Recent samples:</strong></p><ul>${sampleItems}</ul>` : ""}
  `);
  const text = `${count} warning(s) were logged on QuickExpense since ${since ?? ""}.\n\n${samples.map((sample) => `- ${sampleLabel(sample)} (userId: ${sample.userId ?? 0})`).join("\n")}`;
  return { subject, html, text };
}
