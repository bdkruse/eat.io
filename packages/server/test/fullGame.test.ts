import { expect, test } from "vitest";
import { parseServerMessage } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { defaultRules, makeRules } from "../src/engine/rules/index.js";
import type { GameState, PlayerId } from "../src/engine/state.js";
import {
  applyAction,
  autoMove,
  everyoneSubmitted,
  isGameOver,
  rankResult,
  resolveRound,
  viewFor,
} from "../src/engine/engine.js";

function play(seed: number) {
  let g = createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed,
  });
  let guard = 0;
  while (!isGameOver(g)) {
    g = autoMove(g, "p1");
    g = autoMove(g, "p2");
    expect(everyoneSubmitted(g)).toBe(true);
    ({ state: g } = resolveRound(g, defaultRules));
    if (++guard > 100) throw new Error("game did not terminate");
  }
  return g;
}

test("a full game terminates after roundCount rounds with valid state throughout", () => {
  const g = play(7);
  expect(g.roundIndex).toBe(10);
  for (const p of Object.values(g.players)) {
    expect(p.score).toBeGreaterThan(0);
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
  }
  const ranked = rankResult(g);
  expect(ranked.winner === null || ranked.winner === "a" || ranked.winner === "b").toBe(true);
  // The room adds its mode and each player's appearance; the engine's view is everything else.
  const view = viewFor(g, "p1", null);
  const roomState = {
    ...view,
    mode: "match",
    you: { ...view.you, appearance: null },
    opponent: { ...view.opponent, appearance: null },
  };
  expect(() => parseServerMessage(roomState)).not.toThrow();
});

test("same seed produces identical final scores (reproducible)", () => {
  const scores = (seed: number) => Object.values(play(seed).players).map((p) => p.score);
  expect(scores(11)).toEqual(scores(11));
});

test("a full game that plays every card type at least once plays to the end", () => {
  // Two of every catalog card, so the deck runs out and is rebuilt mid-game too.
  const rules = makeRules({ deck: defaultRules.cards.map((card) => ({ cardId: card.id, copies: 2 })) });
  let state: GameState = createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules,
    roundCount: 20,
    seed: 3,
  });
  const playedCardIds = new Set<string>();

  /** Plays a card type not yet played when one is in hand, else the first card. */
  const playSomething = (current: GameState, playerId: PlayerId): GameState => {
    const player = current.players[playerId]!;
    const card = player.hand.find((handCard) => !playedCardIds.has(handCard.id)) ?? player.hand[0]!;
    playedCardIds.add(card.id);
    const targetTrayIds = player.table.slice(0, card.targets).map((tray) => tray.id);
    return applyAction(current, playerId, { cardInstanceId: card.instanceId, targetTrayIds });
  };

  let guard = 0;
  while (!isGameOver(state)) {
    state = playSomething(playSomething(state, "p1"), "p2");
    expect(everyoneSubmitted(state)).toBe(true);
    ({ state } = resolveRound(state, rules));
    for (const playerId of ["p1", "p2"]) {
      const view = viewFor(state, playerId, null);
      const roomState = {
        ...view,
        mode: "match",
        you: { ...view.you, appearance: null },
        opponent: { ...view.opponent, appearance: null },
      };
      expect(() => parseServerMessage(roomState)).not.toThrow();
    }
    if (++guard > 100) throw new Error("game did not terminate");
  }

  expect(state.roundIndex).toBe(20);
  expect([...playedCardIds].sort()).toEqual(rules.cards.map((card) => card.id).sort());
  for (const player of Object.values(state.players)) {
    expect(player.hand.length).toBe(rules.config.handSize);
    expect(player.table.length).toBe(rules.config.tableLength);
  }
});
