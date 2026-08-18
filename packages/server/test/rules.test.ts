import { expect, test } from "vitest";
import { defaultRules, makeRules } from "../src/engine/rules/index.js";
import { createGame } from "../src/engine/deal.js";
import { makeRng } from "../src/util/rng.js";

test("add and multiply effects dispatch over data", () => {
  const add = defaultRules.cards.find((c) => c.action === "add")!;
  const mul = defaultRules.cards.find((c) => c.action === "multiply")!;
  expect(defaultRules.applyEffect({ id: "t", value: 3 }, add).value).toBe(3 + add.amount);
  expect(defaultRules.applyEffect({ id: "t", value: 3 }, mul).value).toBe(3 * mul.amount);
});

test("buildDeck is deterministic per seed and sized to config", () => {
  const [d1] = defaultRules.buildDeck(makeRng(1));
  const [d2] = defaultRules.buildDeck(makeRng(1));
  expect(d1.map((c) => c.id)).toEqual(d2.map((c) => c.id));
  expect(d1.length).toBe(defaultRules.config.deckSize);
});

test("fresh tray value is within the configured band", () => {
  let rng = makeRng(99);
  for (let i = 0; i < 50; i++) {
    const [v, n] = defaultRules.freshTrayValue(rng);
    rng = n;
    expect(v).toBeGreaterThanOrEqual(defaultRules.config.trayMin);
    expect(v).toBeLessThanOrEqual(defaultRules.config.trayMax);
  }
});

test("makeRules overrides tuning so env config can reach the game", () => {
  const rules = makeRules({ tableLength: 9, handSize: 7 });
  expect(rules.config.tableLength).toBe(9);
  expect(rules.config.handSize).toBe(7);
  // untouched values still come from the provisional content
  expect(rules.config.deckSize).toBe(defaultRules.config.deckSize);
  expect(rules.config.trayMin).toBe(defaultRules.config.trayMin);
});

test("makeRules with no overrides matches defaultRules", () => {
  expect(makeRules().config).toEqual(defaultRules.config);
});

test("a deal built from overridden rules honours the new sizes", () => {
  const rules = makeRules({ tableLength: 9, handSize: 7 });
  const game = createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules,
    roundCount: 10,
    seed: 3,
  });
  for (const player of Object.values(game.players)) {
    expect(player.table.length).toBe(9);
    expect(player.hand.length).toBe(7);
  }
});
