import { expect, test } from "vitest";
import {
  parseClientMessage,
  parseServerMessage,
  ClientMessageSchema,
  PROTOCOL_VERSION,
} from "../src/index.js";

test("valid hello parses and keeps optional sessionToken absent", () => {
  const msg = parseClientMessage({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" });
  expect(msg.type).toBe("hello");
  if (msg.type === "hello") expect(msg.sessionToken).toBeUndefined();
});

test("submitTurn names a card INSTANCE and requires a targets array", () => {
  const ok = parseClientMessage({
    type: "submitTurn",
    cardInstanceId: "c7",
    targetTrayIds: ["t1"],
  });
  expect(ok.type).toBe("submitTurn");
  expect(() => parseClientMessage({ type: "submitTurn", cardInstanceId: "c7" })).toThrow();
  // The catalog id is not accepted in its place — the field names differ deliberately.
  expect(() =>
    parseClientMessage({ type: "submitTurn", cardId: "add1x1", targetTrayIds: ["t1"] }),
  ).toThrow();
});

test("unknown message type is rejected, not silently accepted", () => {
  expect(() => parseClientMessage({ type: "totallyMadeUp" })).toThrow();
});

test("server room.state carries opponent hand COUNT, never cards", () => {
  const view = {
    type: "roomState",
    phase: "in-progress",
    roundIndex: 0,
    roundCount: 10,
    deadlineAt: 123,
    you: { seat: "a", name: "Riley", score: 0, submitted: false,
      table: [{ id: "t1", value: 2 }],
      hand: [{ id: "add1x1", instanceId: "c1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1 }] },
    opponent: { seat: "b", name: "Sam", score: 0, submitted: false, handCount: 5,
      table: [{ id: "u1", value: 3 }] },
  };
  const parsed = parseServerMessage(view);
  expect(parsed.type).toBe("roomState");
  // A stray opponent.hand field must be stripped/ignored, never surfaced as cards.
  expect((parsed as Record<string, unknown>)["opponent"]).not.toHaveProperty("hand");
});
