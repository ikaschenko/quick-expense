import crypto from "node:crypto";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Escapes a string for safe interpolation into HTML content.
 * Replaces &, <, >, " and ' with their HTML entity equivalents.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Adds a posthog-key <meta> tag to the SPA HTML so the key can stay a runtime secret.
 * Returns the HTML unchanged when the key is missing or not a valid PostHog project key.
 * @param {string} html
 * @param {string | undefined} key
 * @returns {string}
 */
export function injectPosthogKey(html, key) {
  if (!key || !/^phc_[A-Za-z0-9]+$/.test(key)) {
    return html;
  }
  return html.replace("</head>", `<meta name="posthog-key" content="${key}" />\n</head>`);
}

/**
 * Returns the runtime PostHog project key, or null when it is missing or not a `phc_` key.
 * @returns {string | null}
 */
export function getAnalyticsKey() {
  const key = process.env.VITE_POSTHOG_KEY?.trim();
  return key && /^phc_[A-Za-z0-9]+$/.test(key) ? key : null;
}

/**
 * One-way analytics identity for an email. Must match hashEmail() in app-web/services/analytics.ts
 * so server events land on the person the browser identifies.
 * @param {string} email
 * @returns {string}
 */
export function hashAnalyticsIdentity(email) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Normalizes any thrown value into a plain { message, stack } shape for logging.
 * @param {unknown} error
 * @returns {{ message: string, stack: string | undefined }}
 */
export function serializeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error), stack: undefined };
}
