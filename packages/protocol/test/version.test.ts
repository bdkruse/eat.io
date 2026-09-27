import { expect, test } from "vitest";
import { PROTOCOL_VERSION } from "../src/version.js";

test("protocol version is a positive integer", () => {
  expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  expect(PROTOCOL_VERSION).toBeGreaterThan(0);
});

test("protocol version is 4: table-effect cards, settings, and deck messages", () => {
  expect(PROTOCOL_VERSION).toBe(4);
});
