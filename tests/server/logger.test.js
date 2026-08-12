// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../../app-server/email.js", () => ({
  sendErrorAlertEmail: vi.fn(),
  sendWarningDigestEmail: vi.fn(),
}));

import logger, { sweepLogDirectory, logRouteError } from "../../app-server/logger.js";

describe("sweepLogDirectory", () => {
  function makeFile(dir, name, sizeBytes, ageMsAgo) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, Buffer.alloc(sizeBytes, "a"));
    const time = new Date(Date.now() - ageMsAgo);
    fs.utimesSync(filePath, time, time);
  }

  it("deletes the oldest files until total size is under the cap", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qe-logs-"));
    makeFile(dir, "oldest.log", 1024 * 1024, 3000);
    makeFile(dir, "middle.log", 1024 * 1024, 2000);
    makeFile(dir, "newest.log", 1024 * 1024, 1000);

    sweepLogDirectory(dir, 2); // 2 MB cap, 3 MB present

    expect(fs.readdirSync(dir).sort()).toEqual(["middle.log", "newest.log"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does nothing when total size is already under the cap", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qe-logs-"));
    makeFile(dir, "small.log", 10, 0);

    sweepLogDirectory(dir, 50);

    expect(fs.readdirSync(dir)).toEqual(["small.log"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("handleAlertableEntry", () => {
  let sendErrorAlertEmail;
  let handleAlertableEntry;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ sendErrorAlertEmail } = await import("../../app-server/email.js"));
    ({ handleAlertableEntry } = await import("../../app-server/logger.js"));
  });

  it("sends an error alert email on an error-level entry", () => {
    handleAlertableEntry({ level: "error", message: "boom", event: "test_error", requestId: "req-1" });

    expect(sendErrorAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom", event: "test_error", requestId: "req-1" }),
    );
  });

  it("throttles a second error alert within ALERT_ERROR_THROTTLE_MS", () => {
    handleAlertableEntry({ level: "error", message: "first" });
    handleAlertableEntry({ level: "error", message: "second" });

    expect(sendErrorAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send an email for warn-level entries", () => {
    handleAlertableEntry({ level: "warn", message: "careful" });

    expect(sendErrorAlertEmail).not.toHaveBeenCalled();
  });
});

describe("flushWarningDigest", () => {
  let sendWarningDigestEmail;
  let handleAlertableEntry;
  let flushWarningDigest;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ sendWarningDigestEmail } = await import("../../app-server/email.js"));
    ({ handleAlertableEntry, flushWarningDigest } = await import("../../app-server/logger.js"));
  });

  it("does not send a digest when no warnings were recorded", () => {
    flushWarningDigest();

    expect(sendWarningDigestEmail).not.toHaveBeenCalled();
  });

  it("sends a digest with the accumulated count and samples, then resets the window", () => {
    handleAlertableEntry({ level: "warn", message: "w1" });
    handleAlertableEntry({ level: "warn", message: "w2" });

    flushWarningDigest();

    expect(sendWarningDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2, samples: ["w1", "w2"] }),
    );

    sendWarningDigestEmail.mockClear();
    flushWarningDigest();

    expect(sendWarningDigestEmail).not.toHaveBeenCalled();
  });
});

describe("logRouteError", () => {
  it("logs the error with event/requestId/message and marks it as logged", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const error = new Error("boom");
    const req = { requestId: "req-1" };

    logRouteError(req, "test_event", error);

    expect(spy).toHaveBeenCalledWith("test_event", { event: "test_event", requestId: "req-1", error: "boom" });
    expect(error.logged).toBe(true);
    spy.mockRestore();
  });

  it("no-ops on a second call for an error that was already logged", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const error = new Error("boom");
    const req = { requestId: "req-1" };

    logRouteError(req, "first_event", error);
    logRouteError(req, "second_event", error);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

