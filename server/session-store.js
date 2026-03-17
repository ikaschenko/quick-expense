import session from "express-session";
import FileStoreFactory from "session-file-store";

const FileStore = FileStoreFactory(session);

export function isRetryableSessionStoreError(error) {
  return Boolean(error && ["EACCES", "EBUSY", "EMFILE", "ENFILE", "EPERM"].includes(error.code));
}

export class ResilientFileStore extends FileStore {
  constructor(options = {}) {
    super(options);
    this.maxWriteAttempts = options.maxWriteAttempts ?? 6;
    this.writeRetryDelayMs = options.writeRetryDelayMs ?? 40;
  }

  runWithWriteRetries(operation, callback, attempt = 1) {
    operation((error, ...args) => {
      if (error && isRetryableSessionStoreError(error) && attempt < this.maxWriteAttempts) {
        setTimeout(() => {
          this.runWithWriteRetries(operation, callback, attempt + 1);
        }, this.writeRetryDelayMs * attempt);
        return;
      }

      if (callback) {
        callback(error, ...args);
      }
    });
  }

  set(sessionId, sessionData, callback) {
    this.runWithWriteRetries((done) => super.set(sessionId, sessionData, done), callback);
  }

  get(sessionId, callback) {
    super.get(sessionId, (error, sessionData) => {
      if (error?.code === "ENOENT") {
        callback?.(null, null);
        return;
      }

      callback?.(error, sessionData);
    });
  }

  touch(sessionId, sessionData, callback) {
    this.runWithWriteRetries((done) => super.touch(sessionId, sessionData, done), callback);
  }

  destroy(sessionId, callback) {
    this.runWithWriteRetries((done) => super.destroy(sessionId, done), callback);
  }
}

export function createSessionStore(options) {
  return new ResilientFileStore(options);
}