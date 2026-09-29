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
