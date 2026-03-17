import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSessionStore } from "../server/session-store.js";

const tempDirs = [];

async function createTempSessionDir() {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "quick-expense-session-store-"));
  tempDirs.push(dirPath);
  return dirPath;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

function createSessionPayload(overrides = {}) {
  return {
    cookie: {
      originalMaxAge: 60_000,
      expires: new Date(Date.now() + 60_000).toISOString(),
      httpOnly: true,
      path: "/",
    },
    userEmail: "tester@example.com",
    ...overrides,
  };
}

function storeSet(store, sessionId, sessionData) {
  return new Promise((resolve, reject) => {
    store.set(sessionId, sessionData, (error, savedSession) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(savedSession);
    });
  });
}

function storeGet(store, sessionId) {
  return new Promise((resolve, reject) => {
    store.get(sessionId, (error, sessionData) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(sessionData);
    });
  });
}

function storeTouch(store, sessionId, sessionData) {
  return new Promise((resolve, reject) => {
    store.touch(sessionId, sessionData, (error, touchedSession) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(touchedSession);
    });
  });
}

function storeDestroy(store, sessionId) {
  return new Promise((resolve, reject) => {
    store.destroy(sessionId, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("resilient session store", () => {
  it("supports basic create, read, update, and delete operations", async () => {
    const sessionDir = await createTempSessionDir();
    const store = createSessionStore({
      path: sessionDir,
      fileExtension: ".sess",
      retries: 0,
      reapInterval: -1,
    });

    const sessionId = "session-crud";

    await storeSet(store, sessionId, createSessionPayload());
    expect((await storeGet(store, sessionId)).userEmail).toBe("tester@example.com");

    await storeSet(store, sessionId, createSessionPayload({ userEmail: "updated@example.com" }));
    expect((await storeGet(store, sessionId)).userEmail).toBe("updated@example.com");

    await storeDestroy(store, sessionId);
    expect(await storeGet(store, sessionId)).toBeNull();
  });

  it("touch preserves session data and updates the stored last-access marker", async () => {
    const sessionDir = await createTempSessionDir();
    const store = createSessionStore({
      path: sessionDir,
      fileExtension: ".sess",
      retries: 0,
      reapInterval: -1,
    });

    const sessionId = "session-touch";
    await storeSet(store, sessionId, createSessionPayload({ userEmail: "touch@example.com" }));

    const beforeTouch = await storeGet(store, sessionId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await storeTouch(store, sessionId, {
      ...beforeTouch,
      cookie: {
        ...beforeTouch.cookie,
        expires: new Date(Date.now() + 120_000).toISOString(),
      },
    });

    const afterTouch = await storeGet(store, sessionId);
    expect(afterTouch.userEmail).toBe("touch@example.com");
    expect(typeof afterTouch.__lastAccess).toBe("number");
    expect(afterTouch.__lastAccess).toBeGreaterThanOrEqual(beforeTouch.__lastAccess ?? 0);
  });
});