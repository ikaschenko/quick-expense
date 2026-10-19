import winstonLogger from "./logger.js";
import { serializeError } from "./utils.js";
import { getContext } from "./request-context.js";

export function logInfrastructureError(context, error, logger = winstonLogger) {
  const { message, stack } = serializeError(error);
  logger.error(context, { error: message, stack });
}

export function destroySession(sessionState) {
  return new Promise((resolve, reject) => {
    if (!sessionState || typeof sessionState.destroy !== "function") {
      resolve();
      return;
    }

    sessionState.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function safelyDestroySession(sessionState, context, logger = winstonLogger) {
  try {
    await destroySession(sessionState);
  } catch (error) {
    logInfrastructureError(context, error, logger);
  }
}

async function resolveAuthenticatedIdentity(req, res, { getUserSession, getUserRecord, destroySessionState, logger }) {
  const sessionUser = getUserSession(req);
  if (!sessionUser) {
    res.status(401).json({ message: "Please sign in to continue." });
    return false;
  }

  try {
    const userRecord = await getUserRecord(sessionUser.email);
    if (!userRecord) {
      await destroySessionState(req.session, "Failed to clear stale authenticated session.", logger);
      res.status(401).json({ message: "Stored session is no longer available. Please sign in again." });
      return false;
    }
    req.userRecord = userRecord;
    getContext().userId = userRecord.id;
    return true;
  } catch (error) {
    logInfrastructureError("Failed to verify authenticated session", error, logger);
    res.status(500).json({ message: "Unable to verify your session right now. Please try again." });
    return false;
  }
}

export function createRequireIdentityAuthenticatedUser(options) {
  const dependencies = { destroySessionState: safelyDestroySession, logger: winstonLogger, ...options };
  return async function requireIdentityAuthenticatedUser(req, res, next) {
    if (await resolveAuthenticatedIdentity(req, res, dependencies)) next();
  };
}

export function createRequireAuthenticatedUser(options) {
  const dependencies = { destroySessionState: safelyDestroySession, logger: winstonLogger, ...options };
  return async function requireAuthenticatedUser(req, res, next) {
    if (!(await resolveAuthenticatedIdentity(req, res, dependencies))) return;
    try {
      const sessionUser = options.getUserSession(req);
      const share = await options.getShareForGuest(sessionUser.email);
      if (share) {
        const ownerRecord = await options.getUserRecord(share.ownerEmail);
        if (!ownerRecord || !ownerRecord.spreadsheetId) {
          res.status(403).json({ message: "The configuration shared with you is no longer valid.", code: "SHARED_CONFIG_INVALID" });
          return;
        }
        req.configRecord = ownerRecord;
        getContext().ownerUserId = ownerRecord.id;
        req.accessLevel = share.accessLevel;
        req.isGuest = true;
      } else {
        req.configRecord = req.userRecord;
        req.accessLevel = "edit";
        req.isGuest = false;
      }
      next();
    } catch (error) {
      logInfrastructureError("Failed to verify authenticated session", error, dependencies.logger);
      res.status(500).json({ message: "Unable to verify your session right now. Please try again." });
    }
  };
}

/** Blocks access for guests (non-owners). Use on config-mutation routes. */
export function requireOwner(req, res, next) {
  if (req.isGuest) {
    res.status(403).json({ message: "This action is not allowed for shared setup users.", code: "GUEST_CANNOT_MODIFY_CONFIG" });
    return;
  }
  next();
}

/** Blocks access for owners. Use on guest-only reset route. */
export function requireGuest(req, res, next) {
  if (!req.isGuest) {
    res.status(403).json({ message: "This action is only available for shared setup users." });
    return;
  }
  next();
}

/** Blocks write operations for view-level guests. */
export function requireEditAccess(req, res, next) {
  if (req.accessLevel !== "edit") {
    res.status(403).json({ message: "You don't have permission for this action. Contact the setup owner to request access.", code: "ACCESS_DENIED" });
    return;
  }
  next();
}

/** Centralized normalized allow-list check for admin-only functionality. */
export function isAppAdminEmail(email) {
  const allowedEmails = [process.env.ADMIN_EMAIL, process.env.ALERT_EMAIL_TO]
    .flatMap((value) => (value || "").split(/[,;]/))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  return !!normalizedEmail && allowedEmails.includes(normalizedEmail);
}

/** Blocks access unless the authenticated user's email is on the admin allow-list. */
export function requireAppAdmin(req, res, next) {
  if (!isAppAdminEmail(req.userRecord?.email)) {
    res.status(403).json({ message: "Admin access required." });
    return;
  }
  req.isAppAdmin = true;
  next();
}

export async function checkDatabaseHealth(dbPool) {
  try {
    await dbPool.query("SELECT 1");
    return { ok: true, checks: { db: "up" } };
  } catch {
    return { ok: false, checks: { db: "down" } };
  }
}

export function createShutdownGuard({ isShuttingDown, excludedPaths = [] }) {
  return function shutdownGuard(req, res, next) {
    if (!isShuttingDown() || excludedPaths.includes(req.path)) {
      next();
      return;
    }

    res.status(503).json({ message: "Server is restarting. Please retry shortly." });
  };
}

export function createGracefulShutdown({
  getServer,
  closeDatabase,
  setShuttingDown,
  logger = winstonLogger,
  onExit = (code) => process.exit(code),
  timeoutMs = 10_000,
}) {
  let shutdownPromise = null;

  return function shutdown(signal) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    setShuttingDown(true);
    logger.info(`Received ${signal}. Starting graceful shutdown.`);

    shutdownPromise = new Promise((resolve) => {
      const server = getServer();
      const timeoutId = setTimeout(() => {
        server?.closeIdleConnections?.();
        server?.closeAllConnections?.();
        logger.error("Graceful shutdown timed out. Forcing exit.");
        resolve(1);
      }, timeoutMs);

      timeoutId.unref?.();

      const closeServer = server
        ? new Promise((resolveServer, rejectServer) => {
            server.close((error) => {
              if (error) {
                rejectServer(error);
                return;
              }

              resolveServer();
            });
          })
        : Promise.resolve();

      closeServer
        .then(() => closeDatabase())
        .then(() => {
          clearTimeout(timeoutId);
          logger.info("Graceful shutdown complete.");
          resolve(0);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          logInfrastructureError("Graceful shutdown failed", error, logger);
          resolve(1);
        });
    }).then((exitCode) => {
      onExit(exitCode);
      return exitCode;
    });

    return shutdownPromise;
  };
}