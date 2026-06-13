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
