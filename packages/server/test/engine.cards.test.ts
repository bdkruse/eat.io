import { expect, test } from "vitest";
import { parseServerMessage } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { makeRules } from "../src/engine/rules/index.js";
import { applyAction, autoMove, resolveRound, validateAction, viewFor } from "../src/engine/engine.js";
import type { Card, GameState, PlayerId } from "../src/engine/state.js";

// Every fresh tray is worth exactly 1, so any extra serving shows up as the difference.
const flatTrayRules = makeRules({ trayMin: 1, trayMax: 1 });

function game(): GameState {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: flatTrayRules,
    roundCount: 10,
    seed: 5,
  });
}

/** A copy of a catalog card, with an instance id no dealt card can have. */
function copyOf(cardId: string, copyNumber = 0): Card {
  const definition = flatTrayRules.cards.find((card) => card.id === cardId);
  if (!definition) throw new Error(`no catalog card ${cardId}`);
  return { ...definition, instanceId: `test-${cardId}-${copyNumber}` };
}

/** Puts `card` in the player's hand in place of the first dealt card. */
function withCardInHand(state: GameState, playerId: PlayerId, card: Card): GameState {
  const player = state.players[playerId]!;
  const hand = [card, ...player.hand.slice(1)];
  return { ...state, players: { ...state.players, [playerId]: { ...player, hand } } };
}

function playCard(state: GameState, playerId: PlayerId, card: Card): GameState {
  return applyAction(withCardInHand(state, playerId, card), playerId, {
    cardInstanceId: card.instanceId,
    targetTrayIds: [],
  });
}

function discardBoth(state: GameState): GameState {
  return resolveRound(autoMove(autoMove(state, "p1"), "p2"), flatTrayRules).state;
}

function newestTrayValue(state: GameState, playerId: PlayerId): number {
  return state.players[playerId]!.table.at(-1)!.value;
}

test("the two new cards are in the catalog with the agreed values", () => {
  expect(flatTrayRules.cards).toContainEqual({
    id: "addAll1",
    name: "Add One Food To Every Tray",
    action: "addAll",
    amount: 1,
    targets: 0,
  });
  expect(flatTrayRules.cards).toContainEqual({
    id: "servings2x2",
    name: "Extra Servings",
    action: "extraServings",
    amount: 2,
    targets: 0,
    turns: 2,
  });
});

test("addAll adds one to all five of your own trays and none of the opponent's", () => {
  const before = game();
  const ownValuesBefore = before.players["p1"]!.table.map((tray) => tray.value);
  const opponentValuesBefore = before.players["p2"]!.table.map((tray) => tray.value);
  expect(ownValuesBefore).toHaveLength(5);

  const played = autoMove(playCard(before, "p1", copyOf("addAll1")), "p2");
  const { state: after } = resolveRound(played, flatTrayRules);

  // The boosted front tray was eaten; the other four moved up, still boosted.
  expect(after.players["p1"]!.score).toBe(ownValuesBefore[0]! + 1);
  expect(after.players["p1"]!.table.slice(0, 4).map((tray) => tray.value)).toEqual(
    ownValuesBefore.slice(1).map((value) => value + 1),
  );
  expect(after.players["p2"]!.score).toBe(opponentValuesBefore[0]!);
  expect(after.players["p2"]!.table.slice(0, 4).map((tray) => tray.value)).toEqual(
    opponentValuesBefore.slice(1),
  );
});

test("the addAll table effect touches every tray", () => {
  const table = [1, 2, 3, 4, 5].map((value, index) => ({ id: String(index), value }));
  const result = flatTrayRules.applyTableEffect({ table, extraServings: [] }, copyOf("addAll1"));
  expect(result.table.map((tray) => tray.value)).toEqual([2, 3, 4, 5, 6]);
  expect(result.extraServings).toEqual([]);
});

test("servings played in a round boost the tray arriving that round and the next, then stop", () => {
  const played = autoMove(playCard(game(), "p1", copyOf("servings2x2")), "p2");

  const afterFirstRound = resolveRound(played, flatTrayRules).state;
  expect(newestTrayValue(afterFirstRound, "p1")).toBe(3);
  expect(afterFirstRound.players["p1"]!.extraServings).toEqual([2]);
  expect(newestTrayValue(afterFirstRound, "p2")).toBe(1);

  const afterSecondRound = discardBoth(afterFirstRound);
  expect(newestTrayValue(afterSecondRound, "p1")).toBe(3);
  expect(afterSecondRound.players["p1"]!.extraServings).toEqual([]);

  const afterThirdRound = discardBoth(afterSecondRound);
  expect(newestTrayValue(afterThirdRound, "p1")).toBe(1);
  expect(afterThirdRound.players["p1"]!.extraServings).toEqual([]);
});

test("two servings cards add up to [4, 2], as in the spec's example", () => {
  const firstPlayed = autoMove(playCard(game(), "p1", copyOf("servings2x2", 1)), "p2");
  const afterFirstRound = resolveRound(firstPlayed, flatTrayRules).state;
  expect(afterFirstRound.players["p1"]!.extraServings).toEqual([2]);

  const secondPlayed = autoMove(playCard(afterFirstRound, "p1", copyOf("servings2x2", 2)), "p2");
  const afterSecondRound = resolveRound(secondPlayed, flatTrayRules).state;
  expect(newestTrayValue(afterSecondRound, "p1")).toBe(1 + 4);
  expect(afterSecondRound.players["p1"]!.extraServings).toEqual([2]);

  const afterThirdRound = discardBoth(afterSecondRound);
  expect(newestTrayValue(afterThirdRound, "p1")).toBe(1 + 2);
  expect(afterThirdRound.players["p1"]!.extraServings).toEqual([]);
});

test("the servings table effect extends the list with zeros, then adds to the next turns entries", () => {
  const servings = copyOf("servings2x2");
  expect(flatTrayRules.applyTableEffect({ table: [], extraServings: [] }, servings).extraServings).toEqual([2, 2]);
  expect(flatTrayRules.applyTableEffect({ table: [], extraServings: [2] }, servings).extraServings).toEqual([4, 2]);
  expect(flatTrayRules.applyTableEffect({ table: [], extraServings: [1, 1, 1] }, servings).extraServings).toEqual([
    3, 3, 1,
  ]);
});

test("a discarded servings card changes nothing", () => {
  const start = game();
  const player = start.players["p1"]!;
  const allServingsHand = player.hand.map((_, copyNumber) => copyOf("servings2x2", copyNumber));
  const onlyServings: GameState = {
    ...start,
    players: { ...start.players, p1: { ...player, hand: allServingsHand } },
  };

  const discarded = autoMove(autoMove(onlyServings, "p1"), "p2");
  expect(discarded.players["p1"]!.submission?.discard).toBe(true);
  const { state: after } = resolveRound(discarded, flatTrayRules);

  expect(after.players["p1"]!.extraServings).toEqual([]);
  expect(newestTrayValue(after, "p1")).toBe(1);
  expect(after.players["p1"]!.score).toBe(player.table[0]!.value);
});

test("a 0-target card submitted with a tray is WRONG_TARGET_COUNT", () => {
  const card = copyOf("addAll1");
  const state = withCardInHand(game(), "p1", card);
  const trayId = state.players["p1"]!.table[0]!.id;
  expect(validateAction(state, "p1", { cardInstanceId: card.instanceId, targetTrayIds: [trayId] })).toMatchObject({
    ok: false,
    code: "WRONG_TARGET_COUNT",
  });
  expect(validateAction(state, "p1", { cardInstanceId: card.instanceId, targetTrayIds: [] })).toEqual({ ok: true });
});

test("every player starts with no extra servings", () => {
  for (const player of Object.values(game().players)) expect(player.extraServings).toEqual([]);
});

test("the view shows both players' extra servings and a servings card's turns, and validates", () => {
  const played = autoMove(playCard(game(), "p1", copyOf("servings2x2")), "p2");
  const withServingsInHand = withCardInHand(resolveRound(played, flatTrayRules).state, "p1", copyOf("servings2x2", 9));

  const ownView = viewFor(withServingsInHand, "p1", null);
  const opponentView = viewFor(withServingsInHand, "p2", null);
  expect(ownView.you.extraServings).toEqual([2]);
  expect(ownView.opponent.extraServings).toEqual([]);
  expect(opponentView.opponent.extraServings).toEqual([2]);
  expect(ownView.you.hand[0]).toMatchObject({ id: "servings2x2", turns: 2, targets: 0 });
  for (const card of ownView.you.hand.filter((handCard) => handCard.action !== "extraServings")) {
    expect(card).not.toHaveProperty("turns");
  }

  const roomState = {
    ...ownView,
    mode: "match",
    you: { ...ownView.you, appearance: null },
    opponent: { ...ownView.opponent, appearance: null },
  };
  expect(() => parseServerMessage(roomState)).not.toThrow();
});

function newestTray(state: GameState, playerId: PlayerId) {
  return state.players[playerId]!.table.at(-1)!;
}

test("a servings card played from an empty list marks this round's and the next round's arriving trays with their bonus", () => {
  const played = autoMove(playCard(game(), "p1", copyOf("servings2x2")), "p2");

  const afterFirstRound = resolveRound(played, flatTrayRules).state;
  expect(newestTray(afterFirstRound, "p1").bonus).toBe(2);

  const afterSecondRound = discardBoth(afterFirstRound);
  expect(newestTray(afterSecondRound, "p1").bonus).toBe(2);

  const afterThirdRound = discardBoth(afterSecondRound);
  expect(newestTray(afterThirdRound, "p1")).not.toHaveProperty("bonus");
});

test("stacked servings cards mark the arriving tray with their sum", () => {
  const firstPlayed = autoMove(playCard(game(), "p1", copyOf("servings2x2", 1)), "p2");
  const afterFirstRound = resolveRound(firstPlayed, flatTrayRules).state;

  const secondPlayed = autoMove(playCard(afterFirstRound, "p1", copyOf("servings2x2", 2)), "p2");
  const afterSecondRound = resolveRound(secondPlayed, flatTrayRules).state;
  expect(newestTray(afterSecondRound, "p1").bonus).toBe(4);
});

test("a tray arriving with no bonus carries no bonus field, in the state or the view", () => {
  const start = game();
  for (const player of Object.values(start.players)) {
    for (const tray of player.table) expect(tray).not.toHaveProperty("bonus");
  }

  const played = autoMove(playCard(start, "p1", copyOf("servings2x2")), "p2");
  const after = resolveRound(played, flatTrayRules).state;
  expect(newestTray(after, "p2")).not.toHaveProperty("bonus");

  const ownView = viewFor(after, "p1", null);
  expect(ownView.you.table.at(-1)).toEqual({ id: newestTray(after, "p1").id, value: 3, bonus: 2 });
  expect(ownView.opponent.table.at(-1)).not.toHaveProperty("bonus");
  const opponentView = viewFor(after, "p2", null);
  expect(opponentView.opponent.table.at(-1)).toMatchObject({ bonus: 2 });
  for (const tray of ownView.you.table.slice(0, -1)) expect(tray).not.toHaveProperty("bonus");

  const roomState = {
    ...ownView,
    mode: "match",
    you: { ...ownView.you, appearance: null },
    opponent: { ...ownView.opponent, appearance: null },
  };
  expect(() => parseServerMessage(roomState)).not.toThrow();
});
