import { expect, test } from "vitest";
import { parseServerMessage } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { viewFor } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("view shows your hand but never the opponent's cards or any deck", () => {
  const view = viewFor(game(), "p1", 12345);
  expect(view.you.hand.length).toBe(defaultRules.config.handSize);
  expect((view.opponent as Record<string, unknown>)["hand"]).toBeUndefined();
  expect(view.opponent.handCount).toBe(defaultRules.config.handSize);
  expect(JSON.stringify(view)).not.toContain("deck"); // deck never leaves the server
  expect(view.deadlineAt).toBe(12345);
});

test("the projection validates against the protocol schema", () => {
  // The room adds its mode and each player's appearance; the engine's view is everything else.
  const view = viewFor(game(), "p1", null);
  const roomState = {
    ...view,
    mode: "match",
    you: { ...view.you, appearance: null },
    opponent: { ...view.opponent, appearance: null },
  };
  expect(() => parseServerMessage(roomState)).not.toThrow();
});
