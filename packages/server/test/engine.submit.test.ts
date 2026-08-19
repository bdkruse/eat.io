import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { applyAction, autoMove, everyoneSubmitted } from "../src/engine/engine.js";

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

test("applyAction records a submission without changing the board", () => {
  const g = game();
  const card = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const trayId = g.players["p1"]!.table[0]!.id;
  const before = JSON.stringify(g.players["p1"]!.table);
  const next = applyAction(g, "p1", { cardInstanceId: card.instanceId, targetTrayIds: [trayId] });
  expect(next.players["p1"]!.submission).toMatchObject({
    cardInstanceId: card.instanceId,
    targetTrayIds: [trayId],
  });
  expect(JSON.stringify(next.players["p1"]!.table)).toBe(before); // no board change yet
});

test("autoMove marks a discard submission of a held card", () => {
  const g = game();
  const next = autoMove(g, "p1");
  const sub = next.players["p1"]!.submission!;
  expect(sub.discard).toBe(true);
  expect(next.players["p1"]!.hand.some((c) => c.instanceId === sub.cardInstanceId)).toBe(true);
});

test("everyoneSubmitted is the barrier across all players", () => {
  let g = game();
  expect(everyoneSubmitted(g)).toBe(false);
  g = autoMove(g, "p1");
  expect(everyoneSubmitted(g)).toBe(false);
  g = autoMove(g, "p2");
  expect(everyoneSubmitted(g)).toBe(true);
});
