import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

export function getContext() {
  return storage.getStore() ?? { userId: 0 };
}

const MAX_FIELD_LENGTH = 200;

function truncate(value) {
  if (value == null || value === "") return undefined;
  const text = String(value);
  return text.length > MAX_FIELD_LENGTH ? `${text.slice(0, MAX_FIELD_LENGTH)}…` : text;
}

/** Request fields for diagnostics. Uses req.path (no query string) so OAuth codes/tokens are never logged. */
export function requestSummary(req) {
  return {
    method: req.method,
    path: truncate(req.path),
    clientIp: truncate(req.get?.("fly-client-ip") || req.ip),
    userAgent: truncate(req.get?.("user-agent")),
  };
}