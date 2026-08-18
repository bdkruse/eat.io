import { expect, test, vi } from "vitest";
import { manualTime } from "../src/lobby/timers.js";

test("manual timers fire when time is advanced past their delay", () => {
  const { clock, timers, advance } = manualTime();
  const fired: string[] = [];
  timers.schedule(1000, () => fired.push("a"));
  timers.schedule(3000, () => fired.push("b"));
  advance(1000);
  expect(fired).toEqual(["a"]);
  expect(clock.now()).toBe(1000);
  advance(2000);
  expect(fired).toEqual(["a", "b"]);
});

test("a cancelled timer does not fire", () => {
  const { timers, advance } = manualTime();
  const cb = vi.fn();
  const cancel = timers.schedule(500, cb);
  cancel();
  advance(1000);
  expect(cb).not.toHaveBeenCalled();
});
