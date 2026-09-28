import { expect, test } from "vitest";
import { deckTotal } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { makeRules, type Rules } from "../src/engine/rules/index.js";
import { STARTING_DECK } from "../src/engine/rules/content.js";
import type { PlayerState } from "../src/engine/state.js";

const OPENING_HAND = ["add3x1", "mul2x1", "addAll1", "servings2x2", "add1x2"] as const;

const startingRules = makeRules({ handSize: 5, deck: STARTING_DECK });

function game(rules: Rules, openingHands?: Record<string, readonly string[]>) {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules,
    roundCount: 6,
    seed: 42,
    ...(openingHands ? { openingHands } : {}),
  });
}

function copiesOf(cards: PlayerState["deck"], cardId: string): number {
  return cards.filter((card) => card.id === cardId).length;
}

test("an opening hand deals exactly the given cards in order", () => {
  const state = game(startingRules, { p1: OPENING_HAND });
  expect(state.players["p1"]!.hand.map((card) => card.id)).toEqual([...OPENING_HAND]);
});

test("the deck shrinks by one copy of each opening card", () => {
  const withoutOpening = game(startingRules).players["p1"]!;
  const withOpening = game(startingRules, { p1: OPENING_HAND }).players["p1"]!;

  expect(withOpening.deck.length).toBe(deckTotal([...STARTING_DECK]) - OPENING_HAND.length);
  const everyCard = [...withoutOpening.hand, ...withoutOpening.deck];
  for (const cardId of new Set(OPENING_HAND)) {
    expect(copiesOf(withOpening.deck, cardId)).toBe(copiesOf(everyCard, cardId) - 1);
  }
});

test("every dealt card has an instance id unique within the game", () => {
  const state = game(startingRules, { p1: OPENING_HAND });
  const instanceIds = Object.values(state.players).flatMap((player) =>
    [...player.hand, ...player.deck].map((card) => card.instanceId),
  );
  expect(new Set(instanceIds).size).toBe(instanceIds.length);
});

test("an opening card with no copy in the deck is still dealt, stamped from the catalog", () => {
  const withoutServings = STARTING_DECK.filter((entry) => entry.cardId !== "servings2x2");
  const rules = makeRules({ handSize: 5, deck: [...withoutServings, { cardId: "servings2x2", copies: 0 }] });
  const player = game(rules, { p1: OPENING_HAND }).players["p1"]!;

  expect(player.hand.map((card) => card.id)).toEqual([...OPENING_HAND]);
  expect(player.hand[3]).toMatchObject({ id: "servings2x2", action: "extraServings", amount: 2, turns: 2 });
  expect(copiesOf(player.deck, "servings2x2")).toBe(0);
  expect(player.deck.length).toBe(deckTotal([...withoutServings]) - (OPENING_HAND.length - 1));
});

test("the other player's deal is random and unchanged by the option", () => {
  const withoutOpening = game(startingRules);
  const withOpening = game(startingRules, { p1: OPENING_HAND });
  expect(withOpening.players["p2"]).toEqual(withoutOpening.players["p2"]);
  expect(withOpening.players["p1"]!.table).toEqual(withoutOpening.players["p1"]!.table);
});

test("an unknown card id throws", () => {
  expect(() => game(startingRules, { p1: ["add3x1", "noSuchCard"] })).toThrow(/noSuchCard/);
});

test("an opening hand longer than the hand size throws", () => {
  expect(() => game(startingRules, { p1: [...OPENING_HAND, "add1x1"] })).toThrow();
});
