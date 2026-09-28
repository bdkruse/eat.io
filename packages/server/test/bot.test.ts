import { expect, test } from "vitest";
import type { CardView } from "@eat.io/protocol";
import { chooseBotMove, legalBotMoves, type BotMove } from "../src/engine/bot.js";
import { createGame } from "../src/engine/deal.js";
import { validateAction, viewFor } from "../src/engine/engine.js";
import { makeRules } from "../src/engine/rules/index.js";
import { CARD_CATALOG, STARTING_DECK } from "../src/engine/rules/content.js";
import { makeRng } from "../src/util/rng.js";

/** A hand card as the view shows it, from the catalog. */
function cardView(cardId: string, instanceId: string): CardView {
  const definition = CARD_CATALOG.find((card) => card.id === cardId);
  if (!definition) throw new Error(`no catalog card ${cardId}`);
  return { ...definition, instanceId };
}

const table = [
  { id: "t0", value: 2 },
  { id: "t1", value: 4 },
  { id: "t2", value: 1 },
];

test("legalBotMoves gives one move per card, aimed at the front trays", () => {
  const hand = [cardView("addAll1", "c0"), cardView("add3x1", "c1"), cardView("mul2x2", "c2")];
  expect(legalBotMoves({ you: { table, hand } })).toEqual([
    { cardInstanceId: "c0", targetTrayIds: [] },
    { cardInstanceId: "c1", targetTrayIds: ["t0"] },
    { cardInstanceId: "c2", targetTrayIds: ["t0", "t1"] },
  ]);
});

test("legalBotMoves leaves out a card that needs more trays than the table has", () => {
  const hand = [cardView("add1x2", "c0"), cardView("add1x1", "c1")];
  expect(legalBotMoves({ you: { table: [{ id: "t0", value: 3 }], hand } })).toEqual([
    { cardInstanceId: "c1", targetTrayIds: ["t0"] },
  ]);
});

test("chooseBotMove returns null when there is no legal move", () => {
  const [move] = chooseBotMove({ you: { table, hand: [] } }, makeRng(1));
  expect(move).toBeNull();
});

test("the best move is the one whose front tray ends highest, ties to the first card", () => {
  // Front tray 2: add3 → 5, double → 4, addAll → 3, servings → 2. Two add3 copies tie.
  const hand = [
    cardView("mul2x1", "c0"),
    cardView("add3x1", "c1"),
    cardView("addAll1", "c2"),
    cardView("add3x1", "c3"),
    cardView("servings2x2", "c4"),
  ];
  const countsByCardInstanceId = new Map<string, number>();
  for (let seed = 0; seed < 200; seed++) {
    const [move] = chooseBotMove({ you: { table, hand } }, makeRng(seed));
    const cardInstanceId = move!.cardInstanceId;
    countsByCardInstanceId.set(cardInstanceId, (countsByCardInstanceId.get(cardInstanceId) ?? 0) + 1);
  }
  // c1 gets the best half plus its random share; c3, the tied copy, only its random share.
  expect(countsByCardInstanceId.get("c1")!).toBeGreaterThan(100);
  expect(countsByCardInstanceId.get("c3")!).toBeLessThan(60);
});

test("with a fixed seed chooseBotMove returns the same move every time", () => {
  const hand = [cardView("add1x1", "c0"), cardView("mul3x1", "c1"), cardView("addAll1", "c2")];
  const first = chooseBotMove({ you: { table, hand } }, makeRng(77));
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(chooseBotMove({ you: { table, hand } }, makeRng(77))).toEqual(first);
  }
});

test("over 200 seeds the bot picks the best move and other moves, and every move is valid", () => {
  const rules = makeRules({ handSize: 5, deck: STARTING_DECK });
  const openingHand = ["add3x1", "mul2x1", "addAll1", "servings2x2", "add1x2"];
  const state = createGame({
    roomId: "r1",
    seats: [
      { id: "human", seat: "a", name: "Riley" },
      { id: "bot", seat: "b", name: "Sam" },
    ],
    rules,
    roundCount: 6,
    seed: 9,
    openingHands: { bot: openingHand },
  });
  const view = viewFor(state, "bot", null);
  const frontValue = view.you.table[0]!.value;
  // add3 gives front + 3 and double gives front * 2; add3 wins ties by hand order.
  const bestCardInstanceId = view.you.hand[frontValue > 3 ? 1 : 0]!.instanceId;

  const chosenMoves: BotMove[] = [];
  for (let seed = 0; seed < 200; seed++) {
    const [move] = chooseBotMove(view, makeRng(seed));
    chosenMoves.push(move!);
  }

  const chosenCardIds = new Set(chosenMoves.map((move) => move.cardInstanceId));
  expect(chosenCardIds.has(bestCardInstanceId)).toBe(true);
  expect([...chosenCardIds].some((cardInstanceId) => cardInstanceId !== bestCardInstanceId)).toBe(true);
  const bestCount = chosenMoves.filter((move) => move.cardInstanceId === bestCardInstanceId).length;
  expect(bestCount).toBeGreaterThan(100); // the best half plus its random share
  for (const move of chosenMoves) {
    expect(validateAction(state, "bot", move)).toEqual({ ok: true });
  }
});
