import fs from "node:fs";
import path from "node:path";
import winston from "winston";
import "winston-daily-rotate-file";
import Transport from "winston-transport";
import { sendErrorAlertEmail, sendWarningDigestEmail } from "./email.js";
import { serializeError } from "./utils.js";
import { getContext } from "./request-context.js";

export const LOG_DIR = process.env.LOG_DIR?.trim() || path.resolve(process.cwd(), "logs");
const RETENTION_DAYS = process.env.LOG_RETENTION_DAYS?.trim() || "15";
const MAX_TOTAL_MB = Number(process.env.LOG_MAX_TOTAL_MB ?? 50);
const ERROR_THROTTLE_MS = Number(process.env.ALERT_ERROR_THROTTLE_MS ?? 300_000);
const DIGEST_INTERVAL_HOURS = Number(process.env.ALERT_WARNING_DIGEST_INTERVAL_HOURS ?? 24);
const MAX_WARNING_SAMPLES = 5;

fs.mkdirSync(LOG_DIR, { recursive: true });

/** Deletes the oldest files in dir (by mtime) until total size is under maxTotalMb. */
export function sweepLogDirectory(dir = LOG_DIR, maxTotalMb = MAX_TOTAL_MB) {
  let entries;
  try {
    entries = fs.readdirSync(dir).map((name) => {
      const filePath = path.join(dir, name);
      const stats = fs.statSync(filePath);
      return { filePath, size: stats.size, mtimeMs: stats.mtimeMs };
    });
  } catch {
    return;
  }

  const maxBytes = maxTotalMb * 1024 * 1024;
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes <= maxBytes) return;

  for (const entry of entries.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (totalBytes <= maxBytes) break;
    try {
      fs.unlinkSync(entry.filePath);
      totalBytes -= entry.size;
    } catch {
      // Ignore — file may already be gone (rotated/cleaned concurrently).
    }
  }
}

let lastErrorAlertAt = 0;
let warningCount = 0;
let warningSamples = [];
let digestWindowStart = new Date().toISOString();

/** Fans out throttled error alerts and buffers warnings for the digest. Exported for tests. */
export function handleAlertableEntry(info) {
  if (info.level === "error") {
    const now = Date.now();
    if (now - lastErrorAlertAt >= ERROR_THROTTLE_MS) {
      lastErrorAlertAt = now;
      void sendErrorAlertEmail({
        message: info.message,
        event: info.event,
        requestId: info.requestId,
        userId: info.userId,
        ownerUserId: info.ownerUserId,
        timestamp: info.timestamp ?? new Date().toISOString(),
        error: info.error,
        stack: info.stack,
        path: info.path,
        method: info.method,
        statusCode: info.statusCode,
      });
    }
  } else if (info.level === "warn") {
    warningCount += 1;
    if (warningSamples.length >= MAX_WARNING_SAMPLES) {
      warningSamples.shift();
    }
    warningSamples.push({ message: info.message, userId: info.userId ?? 0 });
  }
}

class AlertTransport extends Transport {
  log(info, callback) {
    setImmediate(() => this.emit("logged", info));
    handleAlertableEntry(info);
    callback();
  }
}

/** Sends the warning digest email if any warnings accumulated, then resets the window. Exported for tests. */
export function flushWarningDigest() {
  if (warningCount === 0) return;
  const count = warningCount;
  const samples = [...warningSamples];
  const since = digestWindowStart;
  warningCount = 0;
  warningSamples = [];
  digestWindowStart = new Date().toISOString();
  void sendWarningDigestEmail({ count, since, samples });
}

/** Starts the recurring warning-digest email. Call once at process startup. */
export function startWarningDigestScheduler() {
  const timer = setInterval(flushWarningDigest, DIGEST_INTERVAL_HOURS * 60 * 60 * 1000);
  timer.unref?.();
  return timer;
}

const combinedRotate = new winston.transports.DailyRotateFile({
  dirname: LOG_DIR,
  filename: "combined-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: `${RETENTION_DAYS}d`,
});
combinedRotate.on("rotate", () => sweepLogDirectory());

const errorRotate = new winston.transports.DailyRotateFile({
  dirname: LOG_DIR,
  filename: "error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxFiles: `${RETENTION_DAYS}d`,
});
errorRotate.on("rotate", () => sweepLogDirectory());

export const contextFormat = winston.format((info) => {
  const context = getContext();
  info.userId = context.userId ?? 0;
  if (context.ownerUserId != null) info.ownerUserId = context.ownerUserId;
  if (context.requestId != null) info.requestId = context.requestId;
  return info;
})();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    contextFormat,
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console(), combinedRotate, errorRotate, new AlertTransport()],
});

/** Logs a route-terminating error exactly once via winston; no-ops if already logged (e.g. by stageFailure()). */
export function logRouteError(req, event, error) {
  if (error?.logged) return;
  const { message, stack } = serializeError(error);
  logger.error(event, { event, error: message, stack });
  if (error && typeof error === "object") {
    error.logged = true;
  }
}

/** Lists rotated log files in LOG_DIR (name/size/mtime), newest first. */
export function listLogFiles() {
  try {
    return fs
      .readdirSync(LOG_DIR)
      .filter((name) => name.endsWith(".log"))
      .map((name) => {
        const stats = fs.statSync(path.join(LOG_DIR, name));
        return { name, size: stats.size, mtime: stats.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    return [];
  }
}

/**
 * Reads and filters log entries from a whitelisted file.
 * Returns null when the file isn't among the known rotated files (path-traversal guard).
 */
export function readLogEntries({ file, level, q, lines = 200 }) {
  const knownFiles = listLogFiles().map((entry) => entry.name);
  if (!knownFiles.includes(file)) {
    return null;
  }

  const normalizedLevel = level?.toLowerCase();
  const normalizedQuery = q?.toLowerCase();
  const content = fs.readFileSync(path.join(LOG_DIR, file), "utf-8");

  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { level: "info", message: line };
      }
    })
    .filter(
      (entry) =>
        (!normalizedLevel || entry.level === normalizedLevel) &&
        (!normalizedQuery || JSON.stringify(entry).toLowerCase().includes(normalizedQuery)),
    )
    .slice(-lines);
}

export default logger;
