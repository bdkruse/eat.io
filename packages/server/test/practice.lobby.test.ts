import { expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomStateMessage,
  type ServerMessage,
  type WelcomeMessage,
} from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { manualTime, type Timers } from "../src/lobby/timers.js";
import { Matchmaker } from "../src/lobby/matchmaking.js";
import { RoomRegistry } from "../src/lobby/registry.js";
import { Lobby, type Connection } from "../src/lobby/lobby.js";
import { BOT_MOVE_DELAY_MS, PRACTICE_BOT_LOOK, PRACTICE_BOT_NAME } from "../src/lobby/practiceBot.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { GameConfigStore, startupSettings } from "../src/gameConfig/gameConfigStore.js";
import { ShopStore } from "../src/shop/shopStore.js";
import { STARTING_DECK } from "../src/engine/rules/content.js";

// The saved settings differ from the practice rules, so a practice room shows it ignores them.
const ROUND_COUNT = 2;
const MOVE_DEADLINE_MS = 20000;
const RECONNECT_GRACE_MS = 30000;
const PASSWORD = "correct-horse";
const OPENING_HAND = ["add3x1", "mul2x1", "addAll1", "servings2x2", "add1x2"];
const PRACTICE_ROUND_COUNT = 6;

/** The injected timers, counting the callbacks still waiting to run. */
function countingTimers(timers: Timers) {
  let pendingCount = 0;
  const counted: Timers = {
    schedule(delayMs, callback) {
      let settled = false;
      const settle = () => {
        if (!settled) pendingCount--;
        settled = true;
      };
      pendingCount++;
      const cancel = timers.schedule(delayMs, () => {
        settle();
        callback();
      });
      return () => {
        settle();
        cancel();
      };
    },
  };
  return { timers: counted, pendingCount: () => pendingCount };
}

function makeLobby() {
  const time = manualTime();
  const counted = countingTimers(time.timers);
  let playerSequence = 0, sessionTokenSequence = 0, codeSequence = 0;
  const config = loadConfig({
    RNG_SEED: "5",
    ROUND_COUNT: String(ROUND_COUNT),
    MOVE_DEADLINE_MS: String(MOVE_DEADLINE_MS),
    RECONNECT_GRACE_MS: String(RECONNECT_GRACE_MS),
  });
  const database = openAccountsDatabase(":memory:");
  const accounts = new AccountStore(database, time.clock);
  const gameConfig = new GameConfigStore(database, time.clock);
  gameConfig.ensureDefaults(startupSettings(config), STARTING_DECK);
  const registry = new RoomRegistry();
  const lobby = new Lobby({
    config,
    clock: time.clock,
    timers: counted.timers,
    registry,
    matchmaker: new Matchmaker(() => `C${++codeSequence}`),
    logger: createLogger("error"),
    genId: () => `player-${++playerSequence}`,
    genToken: () => `session-token-${++sessionTokenSequence}`,
    accounts,
    gameConfig,
    shop: new ShopStore(database, time.clock),
  });
  return { lobby, time, accounts, registry, pendingTimerCount: counted.pendingCount };
}
type TestLobby = ReturnType<typeof makeLobby>;

function connection() {
  const out: ServerMessage[] = [];
  const socket: Connection = { send: (message) => out.push(message), session: null };
  return { socket, out };
}
type TestConnection = ReturnType<typeof connection>;

function hello(name: string, sessionToken?: string): ClientMessage {
  return sessionToken === undefined
    ? { type: "hello", protocolVersion: PROTOCOL_VERSION, name }
    : { type: "hello", protocolVersion: PROTOCOL_VERSION, name, sessionToken };
}

function lastOf<Type extends ServerMessage["type"]>(
  out: ServerMessage[],
  type: Type,
): Extract<ServerMessage, { type: Type }> | undefined {
  return [...out].reverse().find((message) => message.type === type) as
    | Extract<ServerMessage, { type: Type }>
    | undefined;
}

function guest(testLobby: TestLobby, name: string): TestConnection {
  const guestConnection = connection();
  testLobby.lobby.handleMessage(guestConnection.socket, hello(name));
  return guestConnection;
}

function registered(testLobby: TestLobby, username: string): TestConnection {
  const accountConnection = guest(testLobby, `guest-${username}`);
  testLobby.lobby.handleMessage(accountConnection.socket, { type: "accountRegister", username, password: PASSWORD });
  return accountConnection;
}

/** Every message the lobby sent `sender` in answer to `message`. */
function send(testLobby: TestLobby, sender: TestConnection, message: ClientMessage): ServerMessage[] {
  const sentBefore = sender.out.length;
  testLobby.lobby.handleMessage(sender.socket, message);
  return sender.out.slice(sentBefore);
}

function latestRoomState(player: TestConnection): RoomStateMessage {
  const roomState = lastOf(player.out, "roomState");
  if (!roomState) throw new Error("expected a roomState");
  return roomState;
}

/** The human plays the first card in hand at the front trays. */
function submitFirstCard(testLobby: TestLobby, player: TestConnection): void {
  const { you } = latestRoomState(player);
  const card = you.hand[0]!;
  const replies = send(testLobby, player, {
    type: "submitTurn",
    cardInstanceId: card.instanceId,
    targetTrayIds: you.table.slice(0, card.targets).map((tray) => tray.id),
  });
  expect(replies[0]).toEqual({ type: "actionAccepted" });
}

/** The human moves at once, then the bot moves on its delay. */
function playRound(testLobby: TestLobby, player: TestConnection): void {
  submitFirstCard(testLobby, player);
  testLobby.time.advance(BOT_MOVE_DELAY_MS);
}

const BUSY_ERROR = { type: "error", code: "ALREADY_BUSY", message: "Leave your game or the queue first." };

test("practiceStart opens a practice room with fixed rules, the opening hand, and Sam", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  send(testLobby, riley, { type: "practiceStart" });

  const roomState = latestRoomState(riley);
  expect(roomState).toMatchObject({
    mode: "practice",
    phase: "in-progress",
    roundIndex: 0,
    roundCount: PRACTICE_ROUND_COUNT,
    deadlineAt: null,
    you: { seat: "a", name: "Riley" },
    opponent: { seat: "b", name: PRACTICE_BOT_NAME, appearance: PRACTICE_BOT_LOOK, handCount: 5 },
  });
  expect(roomState.you.hand.map((card) => card.id)).toEqual(OPENING_HAND);
  expect(PRACTICE_BOT_NAME).toBe("Sam");
});

test("the bot moves a second after the human, and six rounds reach gameOver with no deadline", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  send(testLobby, riley, { type: "practiceStart" });

  submitFirstCard(testLobby, riley);
  expect(latestRoomState(riley)).toMatchObject({ roundIndex: 0, opponent: { submitted: false } });
  testLobby.time.advance(BOT_MOVE_DELAY_MS);
  expect(latestRoomState(riley)).toMatchObject({ roundIndex: 1, deadlineAt: null, you: { submitted: false } });

  // No turn clock: a long wait auto-moves nobody. The bot has moved; the human has not.
  testLobby.time.advance(MOVE_DEADLINE_MS * 10);
  expect(latestRoomState(riley)).toMatchObject({ roundIndex: 1, you: { submitted: false }, opponent: { submitted: true } });

  for (let roundIndex = 1; roundIndex < PRACTICE_ROUND_COUNT; roundIndex++) playRound(testLobby, riley);
  expect(lastOf(riley.out, "gameOver")).toBeDefined();
  expect(latestRoomState(riley)).toMatchObject({ mode: "practice", phase: "finished", deadlineAt: null });
  const roomStates = riley.out.filter((message): message is RoomStateMessage => message.type === "roomState");
  expect(roomStates.every((roomState) => roomState.deadlineAt === null)).toBe(true);
  expect(testLobby.registry.list()).toHaveLength(0);
  expect(testLobby.pendingTimerCount()).toBe(0);
});

test("a finished practice game changes no stats and pays no Lunch Money", () => {
  const testLobby = makeLobby();
  const riley = registered(testLobby, "Riley_1");
  const accountId = testLobby.accounts.findByUsername("Riley_1")!.id;
  const before = testLobby.accounts.get(accountId)!;
  send(testLobby, riley, { type: "practiceStart" });
  for (let roundIndex = 0; roundIndex < PRACTICE_ROUND_COUNT; roundIndex++) playRound(testLobby, riley);

  const gameOverIndex = riley.out.findIndex((message) => message.type === "gameOver");
  expect(gameOverIndex).toBeGreaterThan(-1);
  expect(riley.out.slice(gameOverIndex).some((message) => message.type === "profile")).toBe(false);
  const after = testLobby.accounts.get(accountId)!;
  expect(after.gamesPlayed).toBe(before.gamesPlayed);
  expect(after.gamesWon).toBe(before.gamesWon);
  expect(after.pointsScored).toBe(before.pointsScored);
  expect(after.lunchMoney).toBe(before.lunchMoney);
});

test("practiceStart in the public queue is refused, and the player stays queued", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  send(testLobby, riley, { type: "queueJoin" });

  expect(send(testLobby, riley, { type: "practiceStart" })).toEqual([BUSY_ERROR]);
  expect(testLobby.registry.list()).toHaveLength(0);

  const sam = guest(testLobby, "Sam");
  send(testLobby, sam, { type: "queueJoin" });
  expect(latestRoomState(riley)).toMatchObject({ mode: "match", opponent: { name: "Sam" } });
});

test("practiceStart while holding an unclaimed private room is refused, and the code still works", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  const code = lastOf(send(testLobby, riley, { type: "roomCreatePrivate" }), "roomJoinedPrivate")!.code;

  expect(send(testLobby, riley, { type: "practiceStart" })).toEqual([BUSY_ERROR]);
  expect(testLobby.registry.list()).toHaveLength(0);

  const sam = guest(testLobby, "Sam");
  send(testLobby, sam, { type: "roomJoinPrivate", code });
  expect(latestRoomState(riley)).toMatchObject({ mode: "match", opponent: { name: "Sam" } });
});

test("practiceStart while seated in a match or a practice game is refused, and the room goes on", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  const sam = guest(testLobby, "Sam");
  send(testLobby, riley, { type: "queueJoin" });
  send(testLobby, sam, { type: "queueJoin" });
  const matchState = latestRoomState(riley);

  expect(send(testLobby, riley, { type: "practiceStart" })).toEqual([BUSY_ERROR]);
  expect(testLobby.registry.list()).toHaveLength(1);
  expect(latestRoomState(riley)).toBe(matchState);

  const kai = guest(testLobby, "Kai");
  send(testLobby, kai, { type: "practiceStart" });
  const practiceState = latestRoomState(kai);
  expect(send(testLobby, kai, { type: "practiceStart" })).toEqual([BUSY_ERROR]);
  expect(testLobby.registry.list()).toHaveLength(2);
  expect(latestRoomState(kai)).toBe(practiceState);
});

test("roomLeave ends a practice game at once, and the bot's pending move never runs", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  send(testLobby, riley, { type: "practiceStart" });
  submitFirstCard(testLobby, riley);
  expect(testLobby.pendingTimerCount()).toBe(1);

  const replies = send(testLobby, riley, { type: "roomLeave" });
  expect(replies.map((message) => message.type)).toEqual(["roomState", "roomLeft"]);
  expect(replies[0]).toMatchObject({ mode: "practice", phase: "abandoned" });
  expect(testLobby.registry.list()).toHaveLength(0);
  expect(testLobby.pendingTimerCount()).toBe(0);

  const sentBefore = riley.out.length;
  testLobby.time.advance(BOT_MOVE_DELAY_MS * 10);
  expect(riley.out.slice(sentBefore)).toEqual([]);

  // Free again: a new practice game starts.
  send(testLobby, riley, { type: "practiceStart" });
  expect(latestRoomState(riley)).toMatchObject({ mode: "practice", phase: "in-progress", roundIndex: 0 });
});

test("a reconnect inside the grace resumes the practice game, and the bot plays on", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  const sessionToken = (riley.out[0] as WelcomeMessage).sessionToken;
  send(testLobby, riley, { type: "practiceStart" });
  playRound(testLobby, riley);
  expect(latestRoomState(riley).roundIndex).toBe(1);

  // Drop mid-round; the bot's move falls due while the room is paused.
  testLobby.lobby.handleClose(riley.socket);
  testLobby.time.advance(BOT_MOVE_DELAY_MS * 5);

  const rileyAgain = connection();
  testLobby.lobby.handleMessage(rileyAgain.socket, hello("Riley", sessionToken));
  expect(latestRoomState(rileyAgain)).toMatchObject({
    mode: "practice",
    phase: "in-progress",
    roundIndex: 1,
    deadlineAt: null,
  });

  playRound(testLobby, rileyAgain);
  expect(latestRoomState(rileyAgain).roundIndex).toBe(2);
  playRound(testLobby, rileyAgain);
  expect(latestRoomState(rileyAgain).roundIndex).toBe(3);
});

test("a disconnect past the grace ends the practice game quietly with no result", () => {
  const testLobby = makeLobby();
  const riley = registered(testLobby, "Riley_1");
  const sessionToken = (riley.out[0] as WelcomeMessage).sessionToken;
  const accountId = testLobby.accounts.findByUsername("Riley_1")!.id;
  send(testLobby, riley, { type: "practiceStart" });

  testLobby.lobby.handleClose(riley.socket);
  const sentBefore = riley.out.length;
  testLobby.time.advance(RECONNECT_GRACE_MS);

  expect(riley.out.slice(sentBefore)).toEqual([]);
  expect(testLobby.registry.list()).toHaveLength(0);
  expect(testLobby.pendingTimerCount()).toBe(0);
  expect(testLobby.accounts.get(accountId)!.gamesPlayed).toBe(0);

  // The session went with the room, so the old token starts a fresh one.
  const rileyAgain = connection();
  testLobby.lobby.handleMessage(rileyAgain.socket, hello("Riley", sessionToken));
  expect((rileyAgain.out[0] as WelcomeMessage).sessionToken).not.toBe(sessionToken);
  expect(lastOf(rileyAgain.out, "roomState")).toBeUndefined();
});

test("a normal match roomState has mode match", () => {
  const testLobby = makeLobby();
  const riley = guest(testLobby, "Riley");
  const sam = guest(testLobby, "Sam");
  send(testLobby, riley, { type: "queueJoin" });
  send(testLobby, sam, { type: "queueJoin" });
  expect(latestRoomState(riley)).toMatchObject({ mode: "match", roundCount: ROUND_COUNT });
  expect(latestRoomState(riley).deadlineAt).toBe(MOVE_DEADLINE_MS);
});
