import { expect, test } from "vitest";
import { PROTOCOL_VERSION } from "../src/version.js";

test("protocol version is a positive integer", () => {
  expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  expect(PROTOCOL_VERSION).toBeGreaterThan(0);
});

test("protocol version is 5: clothing, more skin tones, and practice games", () => {
  expect(PROTOCOL_VERSION).toBe(5);
});
