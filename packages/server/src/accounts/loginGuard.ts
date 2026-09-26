import type { Clock } from "../lobby/timers.js";

const DEFAULT_FAILURE_LIMIT = 5;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * A brute-force guard for one login session: once `limit` failures land within
 * `windowMs` of the oldest of them, the guard is blocked until enough time has
 * passed that fewer than `limit` failures remain in the window.
 */
export class LoginGuard {
  private readonly failureTimestamps: number[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly limit: number = DEFAULT_FAILURE_LIMIT,
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
  ) {}

  isBlocked(): boolean {
    this.pruneExpiredFailures();
    return this.failureTimestamps.length >= this.limit;
  }

  recordFailure(): void {
    this.pruneExpiredFailures();
    this.failureTimestamps.push(this.clock.now());
  }

  private pruneExpiredFailures(): void {
    const now = this.clock.now();
    while (this.failureTimestamps.length > 0 && now - this.failureTimestamps[0]! >= this.windowMs) {
      this.failureTimestamps.shift();
    }
  }
}
