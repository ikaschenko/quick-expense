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
