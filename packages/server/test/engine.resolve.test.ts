import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { applyAction, autoMove, resolveRound } from "../src/engine/engine.js";

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

test("an add card boosts the targeted tray, and the front tray is eaten and scored", () => {
  let g = game();
  const p1 = g.players["p1"]!;
  const addCard = p1.hand.find((c) => c.action === "add" && c.targets === 1)!;
  const frontTray = p1.table[0]!;
  const expectedScore = frontTray.value + addCard.amount; // boost the front tray, then eat it

  g = applyAction(g, "p1", { cardInstanceId: addCard.instanceId, targetTrayIds: [frontTray.id] });
  g = autoMove(g, "p2");
  const { state } = resolveRound(g, defaultRules);

  expect(state.players["p1"]!.score).toBe(expectedScore);
  expect(state.roundIndex).toBe(1);
  expect(state.players["p1"]!.submission).toBeNull();
});

test("hand size and table length are preserved across a round", () => {
  let g = game();
  g = autoMove(g, "p1");
  g = autoMove(g, "p2");
  const { state } = resolveRound(g, defaultRules);
  for (const p of Object.values(state.players)) {
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
  }
});

test("a discard applies no effect but still consumes a card and eats the front tray", () => {
  let g = game();
  const frontValue = g.players["p1"]!.table[0]!.value;
  g = autoMove(g, "p1"); // discard
  g = autoMove(g, "p2");
  const { state } = resolveRound(g, defaultRules);
  expect(state.players["p1"]!.score).toBe(frontValue); // no boost from a discard
});
