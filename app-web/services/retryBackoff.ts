/**
 * Retry backoff utility to prevent hammering the API on failures.
 * Tracks retry state and enforces exponential backoff delays.
 */

interface RetryBackoffState {
  failureCount: number;
  lastFailureTime: number;
  nextRetryTime: number;
}

const initialState: RetryBackoffState = {
  failureCount: 0,
  lastFailureTime: 0,
  nextRetryTime: 0,
};

// Configuration: base delay (ms), max failures before giving up
const BASE_DELAY_MS = 2_000; // 2 seconds
const MAX_FAILURE_COUNT = 5; // Stop retrying after 5 failures

export class RetryBackoff {
  private state: RetryBackoffState = { ...initialState };

  /**
   * Check if enough time has passed to retry.
   * @returns true if we can retry now, false if we should wait
   */
  canRetryNow(): boolean {
    if (this.state.failureCount === 0) {
      return true; // First attempt always allowed
    }

    if (this.state.failureCount >= MAX_FAILURE_COUNT) {
      return false; // Give up after max failures
    }

    return Date.now() >= this.state.nextRetryTime;
  }

  /**
   * Get milliseconds until next retry is allowed.
   * @returns 0 if retry is allowed now, positive number otherwise
   */
  msUntilNextRetry(): number {
    if (!navigator.onLine) {
      return BASE_DELAY_MS; // Keep long delay while offline
    }

    if (this.canRetryNow()) {
      return 0;
    }

    return Math.max(0, this.state.nextRetryTime - Date.now());
  }

  /**
   * Record a failure and calculate next retry time.
   */
  recordFailure(): void {
    const now = Date.now();
    this.state.failureCount += 1;
    this.state.lastFailureTime = now;

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const exponentialDelay = BASE_DELAY_MS * Math.pow(2, this.state.failureCount - 1);
    const cappedDelay = Math.min(exponentialDelay, 60_000); // Cap at 60 seconds

    this.state.nextRetryTime = now + cappedDelay;
  }

  /**
   * Reset on success.
   */
  reset(): void {
    this.state = { ...initialState };
  }

  /**
   * Get current retry attempt count.
   */
  getFailureCount(): number {
    return this.state.failureCount;
  }

  /**
   * Check if we've exceeded max retries.
   */
  isMaxRetriesExceeded(): boolean {
    return this.state.failureCount >= MAX_FAILURE_COUNT;
  }
}
