import { describe, expect, test } from "vitest";
import { manualTime } from "../src/lobby/timers.js";
import { LoginGuard } from "../src/accounts/loginGuard.js";

describe("LoginGuard", () => {
  test("four failures do not block", () => {
    const { clock } = manualTime();
    const guard = new LoginGuard(clock);
    guard.recordFailure();
    guard.recordFailure();
    guard.recordFailure();
    guard.recordFailure();
    expect(guard.isBlocked()).toBe(false);
  });

  test("the fifth failure blocks until 60000ms after the first failure, then unblocks", () => {
    const { clock, advance } = manualTime();
    const guard = new LoginGuard(clock);
    for (let failureIndex = 0; failureIndex < 5; failureIndex++) guard.recordFailure();
    expect(guard.isBlocked()).toBe(true);

    advance(59_999);
    expect(guard.isBlocked()).toBe(true);

    advance(1);
    expect(guard.isBlocked()).toBe(false);
  });
});
