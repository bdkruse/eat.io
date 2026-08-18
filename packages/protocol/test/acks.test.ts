import { expect, test } from "vitest";
import { parseServerMessage } from "../src/index.js";

test("queueCancelled and roomLeft are valid server messages", () => {
  expect(parseServerMessage({ type: "queueCancelled" }).type).toBe("queueCancelled");
  expect(parseServerMessage({ type: "roomLeft" }).type).toBe("roomLeft");
});
