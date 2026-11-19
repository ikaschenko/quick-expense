import { requestSummary } from "./request-context.js";

// Server-only module: never import from app-web, so the list is never shipped to browsers.
// Paths that only vulnerability scanners request. Each pattern is tested against the raw and the
// once-decoded request path; extend this array to block new probes.
export const BLOCKED_PATH_PATTERNS = [
  // Secret/VCS dotfiles, incl. encoded dots (%2e) and double-encoded ones (%%32%65, %252e).
  /(?:\/\.|%2e|%32%65)(?:env|git|svn|hg|aws|ssh|docker|npmrc|htaccess|htpasswd|ds_store)(?:[^a-z0-9]|$)/i,
  // Server-side script, backup and config extensions this app never serves.
  /\.(?:php\d?|aspx?|jsp|cgi|sql|bak|old|swp|ini)$/i,
  // Well-known CMS/admin panels and framework endpoints.
  /^\/(?:wp-|wordpress|phpmyadmin|pma\b|cgi-bin|server-status|actuator|xmlrpc|vendor\/phpunit)/i,
];

export function isBlockedPath(rawPath, patterns = BLOCKED_PATH_PATTERNS) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const candidates = [rawPath];
  try {
    const decoded = decodeURIComponent(rawPath);
    if (decoded !== rawPath) candidates.push(decoded);
  } catch {
    // Malformed encoding: only the raw form can be matched.
  }
  return candidates.some((candidate) => patterns.some((pattern) => pattern.test(candidate)));
}

export function createBlockedPathGuard({ logger, patterns = BLOCKED_PATH_PATTERNS }) {
  return function blockedPathGuard(req, res, next) {
    if (!isBlockedPath(req.path, patterns)) {
      next();
      return;
    }
    logger.info("blocked_path", { event: "blocked_path", ...requestSummary(req) });
    res.status(404).type("text/plain").send("Not found.");
  };
}
