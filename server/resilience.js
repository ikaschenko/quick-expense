export function logInfrastructureError(context, error, logger = console) {
  logger.error(`${context}:`, error);
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

export async function safelyDestroySession(sessionState, context, logger = console) {
  try {
    await destroySession(sessionState);
  } catch (error) {
    logInfrastructureError(context, error, logger);
  }
}

export function createRequireAuthenticatedUser({
  getUserSession,
  getUserRecord,
  getShareForGuest,
  destroySessionState = safelyDestroySession,
  logger = console,
}) {
  return async function requireAuthenticatedUser(req, res, next) {
    const sessionUser = getUserSession(req);
    if (!sessionUser) {
      res.status(401).json({ message: "Please sign in to continue." });
      return;
    }

    try {
      const userRecord = await getUserRecord(sessionUser.email);
      if (!userRecord) {
        await destroySessionState(req.session, "Failed to clear stale authenticated session.", logger);
        res.status(401).json({ message: "Stored session is no longer available. Please sign in again." });
        return;
      }

      req.userRecord = userRecord;

      // Resolve shared setup: check if this user is a guest.
      const share = await getShareForGuest(sessionUser.email);
      if (share) {
        const ownerRecord = await getUserRecord(share.ownerEmail);
        if (!ownerRecord || !ownerRecord.spreadsheetId) {
          // Owner config is invalid — signal frontend to show the recovery modal.
          res.status(403).json({ message: "The configuration shared with you is no longer valid.", code: "SHARED_CONFIG_INVALID" });
          return;
        }
        req.configRecord = ownerRecord;
        req.accessLevel = share.accessLevel;
        req.isGuest = true;
      } else {
        req.configRecord = userRecord;
        req.accessLevel = "edit";
        req.isGuest = false;
      }

      next();
    } catch (error) {
      logInfrastructureError("Failed to verify authenticated session", error, logger);
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
  logger = console,
  onExit = (code) => process.exit(code),
  timeoutMs = 10_000,
}) {
  let shutdownPromise = null;

  return function shutdown(signal) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    setShuttingDown(true);
    logger.log(`Received ${signal}. Starting graceful shutdown.`);

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
          logger.log("Graceful shutdown complete.");
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