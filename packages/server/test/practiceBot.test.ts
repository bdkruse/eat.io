import { expect, test } from "vitest";
import { AppearanceSchema, lockedItemsIn, type RoomStateMessage, type ServerMessage } from "@eat.io/protocol";
import type { BotMove } from "../src/engine/bot.js";
import { createGame } from "../src/engine/deal.js";
import { applyAction, validateAction, viewFor } from "../src/engine/engine.js";
import { makeRules } from "../src/engine/rules/index.js";
import { STARTING_DECK, TUNING } from "../src/engine/rules/content.js";
import type { GameState } from "../src/engine/state.js";
import { manualTime } from "../src/lobby/timers.js";
import { BOT_MOVE_DELAY_MS, PRACTICE_BOT_LOOK, PracticeBot } from "../src/lobby/practiceBot.js";

const BOT_ID = "bot:r1";
const HUMAN_ID = "human";

function practiceGame(seed = 7): GameState {
  return createGame({
    roomId: "r1",
    seats: [
      { id: HUMAN_ID, seat: "a", name: "Riley" },
      { id: BOT_ID, seat: "b", name: "Sam" },
    ],
    rules: makeRules({ tableLength: TUNING.tableLength, handSize: 5, deck: STARTING_DECK }),
    roundCount: 6,
    seed,
  });
}

/** The bot's own roomState for `state`, as the room sends it. */
function botView(state: GameState): RoomStateMessage {
  const gameView = viewFor(state, BOT_ID, null);
  return {
    ...gameView,
    mode: "practice",
    you: { ...gameView.you, appearance: null },
    opponent: { ...gameView.opponent, appearance: null },
  };
}

function makeBot(seed = 11) {
  const time = manualTime();
  const submitted: BotMove[] = [];
  const bot = new PracticeBot({
    playerId: BOT_ID,
    timers: time.timers,
    seed,
    submit: (move) => submitted.push(move),
    delayMs: BOT_MOVE_DELAY_MS,
  });
  return { bot, time, submitted };
}

test("the bot moves about a second after a round starts", () => {
  expect(BOT_MOVE_DELAY_MS).toBe(1000);
  const { bot, time, submitted } = makeBot();
  const state = practiceGame();
  bot.receive(botView(state));

  time.advance(BOT_MOVE_DELAY_MS - 1);
  expect(submitted).toEqual([]);
  time.advance(1);
  expect(submitted).toHaveLength(1);
  expect(validateAction(state, BOT_ID, submitted[0]!)).toEqual({ ok: true });
});

test("a repeated roomState in the same round schedules only one move", () => {
  const { bot, time, submitted } = makeBot();
  const state = practiceGame();
  bot.receive(botView(state));
  time.advance(500);
  bot.receive(botView(state));
  time.advance(BOT_MOVE_DELAY_MS * 3);
  expect(submitted).toHaveLength(1);
});

test("the move is chosen from the latest view when the timer fires", () => {
  const { bot, time, submitted } = makeBot();
  const firstRound = practiceGame(7);
  const otherGame = practiceGame(8);
  bot.receive(botView(firstRound));
  bot.receive(botView(otherGame));
  time.advance(BOT_MOVE_DELAY_MS);
  const handIds = otherGame.players[BOT_ID]!.hand.map((card) => card.instanceId);
  expect(handIds).toContain(submitted[0]!.cardInstanceId);
  expect(validateAction(otherGame, BOT_ID, submitted[0]!)).toEqual({ ok: true });
});

test("nothing is scheduled once the bot has submitted, or outside an in-progress round", () => {
  const { bot, time, submitted } = makeBot();
  const state = practiceGame();
  const botPlayer = state.players[BOT_ID]!;
  const card = botPlayer.hand[0]!;
  const afterSubmit = applyAction(state, BOT_ID, {
    cardInstanceId: card.instanceId,
    targetTrayIds: botPlayer.table.slice(0, card.targets).map((tray) => tray.id),
  });

  bot.receive(botView(afterSubmit));
  for (const phase of ["waiting", "paused", "finished", "abandoned"] as const) {
    bot.receive({ ...botView(state), phase });
  }
  time.advance(BOT_MOVE_DELAY_MS * 3);
  expect(submitted).toEqual([]);
});

test("every other message is ignored", () => {
  const { bot, time, submitted } = makeBot();
  const otherMessages: ServerMessage[] = [
    { type: "actionAccepted" },
    { type: "opponentDisconnected", graceEndsAt: 30000 },
    { type: "opponentReconnected" },
    { type: "gameOver", result: { kind: "win", scores: { a: 1, b: 2 } } },
  ];
  for (const message of otherMessages) bot.receive(message);
  time.advance(BOT_MOVE_DELAY_MS * 3);
  expect(submitted).toEqual([]);
});

test("stop cancels a pending move", () => {
  const { bot, time, submitted } = makeBot();
  bot.receive(botView(practiceGame()));
  bot.stop();
  time.advance(BOT_MOVE_DELAY_MS * 3);
  expect(submitted).toEqual([]);
});

test("the next round schedules a new move after the last one fired", () => {
  const { bot, time, submitted } = makeBot();
  const state = practiceGame();
  bot.receive(botView(state));
  time.advance(BOT_MOVE_DELAY_MS);
  bot.receive({ ...botView(state), roundIndex: 1 });
  time.advance(BOT_MOVE_DELAY_MS);
  expect(submitted).toHaveLength(2);
});

test("the same seed makes the same moves", () => {
  const movesFor = (seed: number) => {
    const { bot, time, submitted } = makeBot(seed);
    for (let gameSeed = 1; gameSeed <= 8; gameSeed++) {
      bot.receive(botView(practiceGame(gameSeed)));
      time.advance(BOT_MOVE_DELAY_MS);
    }
    return submitted;
  };
  expect(movesFor(3)).toEqual(movesFor(3));
});

test("the bot's look is complete and free", () => {
  expect(AppearanceSchema.parse(PRACTICE_BOT_LOOK)).toEqual(PRACTICE_BOT_LOOK);
  expect(lockedItemsIn(PRACTICE_BOT_LOOK, [])).toEqual([]);
});
