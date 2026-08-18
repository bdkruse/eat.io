import { afterEach, expect, test, vi } from "vitest";
import { createLogger } from "../src/logger.js";

afterEach(() => vi.restoreAllMocks());

test("levels below the threshold are suppressed", () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  const log = createLogger("info");
  log.debug("hidden");
  log.info("shown");
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0]![0]).toContain("shown");
});

test("child merges bindings into every line", () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  const log = createLogger("debug", { app: "eatio" }).child({ roomId: "r1" });
  log.info("hi", { extra: 1 });
  const line = spy.mock.calls[0]![0] as string;
  expect(line).toContain('"app":"eatio"');
  expect(line).toContain('"roomId":"r1"');
  expect(line).toContain('"extra":1');
});
