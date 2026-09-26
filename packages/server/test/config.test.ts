import { expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

test("defaults match the spec", () => {
  const c = loadConfig({});
  expect(c.port).toBe(8000);
  expect(c.roundCount).toBe(20);
  expect(c.moveDeadlineMs).toBe(20000);
  expect(c.reconnectGraceMs).toBe(30000);
  expect(c.seed).toBeNull();
  expect(c.logLevel).toBe("info");
});

test("env overrides are parsed as integers", () => {
  const c = loadConfig({ PORT: "9001", ROUND_COUNT: "6", RNG_SEED: "42", LOG_LEVEL: "debug" });
  expect(c.port).toBe(9001);
  expect(c.roundCount).toBe(6);
  expect(c.seed).toBe(42);
  expect(c.logLevel).toBe("debug");
});

test("a non-numeric override fails loudly", () => {
  expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/PORT/);
});

test("DATABASE_PATH defaults and can be overridden", () => {
  expect(loadConfig({}).databasePath).toBe("data/eatio.sqlite");
  expect(loadConfig({ DATABASE_PATH: "tmp/test.sqlite" }).databasePath).toBe("tmp/test.sqlite");
});
