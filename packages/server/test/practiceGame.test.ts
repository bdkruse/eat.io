import { expect, test } from "vitest";
import { chooseBotMove } from "../src/engine/bot.js";
import { createGame } from "../src/engine/deal.js";
import {
  applyAction,
  everyoneSubmitted,
  isGameOver,
  resolveRound,
  validateAction,
  viewFor,
} from "../src/engine/engine.js";
import { makeRules } from "../src/engine/rules/index.js";
import { STARTING_DECK, TUNING } from "../src/engine/rules/content.js";
import type { GameState, Submission } from "../src/engine/state.js";
import { makeRng, type Rng } from "../src/util/rng.js";

const OPENING_HAND = ["add3x1", "mul2x1", "addAll1", "servings2x2", "add1x2"];
const HUMAN_ID = "human";
const BOT_ID = "bot";

function submit(state: GameState, playerId: string, move: Submission): GameState {
  expect(validateAction(state, playerId, move)).toEqual({ ok: true });
  return applyAction(state, playerId, move);
}

test("a practice game with a scripted human and the bot plays 6 rounds to the end", () => {
  const rules = makeRules({ tableLength: TUNING.tableLength, handSize: 5, deck: STARTING_DECK });
  let state = createGame({
    roomId: "practice",
    seats: [
      { id: HUMAN_ID, seat: "a", name: "Riley" },
      { id: BOT_ID, seat: "b", name: "Sam" },
    ],
    rules,
    roundCount: 6,
    seed: 2026,
    openingHands: { [HUMAN_ID]: OPENING_HAND },
  });
  expect(state.players[HUMAN_ID]!.hand.map((card) => card.id)).toEqual(OPENING_HAND);

  let botRng: Rng = makeRng(31);
  let resolvedRounds = 0;
  while (!isGameOver(state)) {
    const human = state.players[HUMAN_ID]!;
    const firstCard = human.hand[0]!;
    state = submit(state, HUMAN_ID, {
      cardInstanceId: firstCard.instanceId,
      targetTrayIds: human.table.slice(0, firstCard.targets).map((tray) => tray.id),
    });

    const [botMove, afterBotMove] = chooseBotMove(viewFor(state, BOT_ID, null), botRng);
    botRng = afterBotMove;
    expect(botMove).not.toBeNull();
    state = submit(state, BOT_ID, botMove!);

    expect(everyoneSubmitted(state)).toBe(true);
    ({ state } = resolveRound(state, rules));
    resolvedRounds++;
    if (resolvedRounds > 6) throw new Error("practice game did not end after 6 rounds");
  }

  expect(resolvedRounds).toBe(6);
  expect(state.roundIndex).toBe(6);
});
