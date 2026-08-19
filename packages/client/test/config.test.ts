import { expect, test } from "vitest";
import { defaultServerUrl } from "../src/config.js";

test("falls back to the local server when nothing is configured", () => {
  expect(defaultServerUrl({})).toBe("ws://localhost:8000");
  expect(defaultServerUrl({ VITE_SERVER_URL: "   " })).toBe("ws://localhost:8000");
});

test("an explicit VITE_SERVER_URL wins", () => {
  expect(defaultServerUrl({ VITE_SERVER_URL: "ws://game.example:9000" })).toBe(
    "ws://game.example:9000",
  );
});
