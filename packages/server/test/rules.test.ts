import { expect, test } from "vitest";
import { deckTotal } from "@eat.io/protocol";
import { defaultRules, makeRules } from "../src/engine/rules/index.js";
import { STARTING_DECK } from "../src/engine/rules/content.js";
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
  expect(d1.length).toBe(deckTotal([...defaultRules.config.deck]));
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
  expect(rules.config.deck).toEqual(defaultRules.config.deck);
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

function copiesByCardId(cardIds: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cardId of cardIds) counts[cardId] = (counts[cardId] ?? 0) + 1;
  return counts;
}

test("the starting deck is the agreed 40 cards", () => {
  expect(STARTING_DECK).toEqual([
    { cardId: "add1x1", copies: 5 },
    { cardId: "add1x2", copies: 7 },
    { cardId: "add3x1", copies: 7 },
    { cardId: "mul2x1", copies: 7 },
    { cardId: "mul2x2", copies: 6 },
    { cardId: "mul3x1", copies: 6 },
    { cardId: "addAll1", copies: 1 },
    { cardId: "servings2x2", copies: 1 },
  ]);
  expect(deckTotal([...STARTING_DECK])).toBe(40);
  expect(defaultRules.config.deck).toEqual(STARTING_DECK);
});

test("buildDeck with the starting deck builds exactly its copies", () => {
  const [deck] = defaultRules.buildDeck(makeRng(4));
  expect(copiesByCardId(deck.map((card) => card.id))).toEqual({
    add1x1: 5,
    add1x2: 7,
    add3x1: 7,
    mul2x1: 7,
    mul2x2: 6,
    mul3x1: 6,
    addAll1: 1,
    servings2x2: 1,
  });
});

test("a card missing from the composition gets 0 copies, and unknown ids are ignored", () => {
  const rules = makeRules({
    deck: [
      { cardId: "add1x1", copies: 8 },
      { cardId: "servings2x2", copies: 4 },
      { cardId: "notACard", copies: 3 },
    ],
  });
  const [deck] = rules.buildDeck(makeRng(4));
  expect(copiesByCardId(deck.map((card) => card.id))).toEqual({ add1x1: 8, servings2x2: 4 });
});

test("buildDeck shuffles: the deck is not in catalog order", () => {
  const [deck] = defaultRules.buildDeck(makeRng(4));
  const sortedByCatalog = [...deck].sort(
    (first, second) =>
      defaultRules.cards.findIndex((card) => card.id === first.id) -
      defaultRules.cards.findIndex((card) => card.id === second.id),
  );
  expect(deck.map((card) => card.id)).not.toEqual(sortedByCatalog.map((card) => card.id));
});
