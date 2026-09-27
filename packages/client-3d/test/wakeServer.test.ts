import { expect, test } from "vitest";
import { wakeUrlFor } from "../src/connection/wakeServer.js";

test("a secure WebSocket address wakes through the matching https address", () => {
  expect(wakeUrlFor("wss://eatio.bonto.run")).toBe("https://eatio.bonto.run/");
});

test("a plain WebSocket address wakes through http, keeping the port", () => {
  expect(wakeUrlFor("ws://localhost:8765")).toBe("http://localhost:8765/");
});

test("an address that is not a WebSocket address has nothing to wake", () => {
  expect(wakeUrlFor("not an address")).toBeNull();
  expect(wakeUrlFor("https://eatio.bonto.run")).toBeNull();
});
