import { expect, test } from "vitest";
import type { RoomStateMessage, ServerMessage } from "@eat.io/protocol";
import { initialAppState, type AppState } from "../src/state/gameState.js";
import { gameReducer } from "../src/state/gameReducer.js";

const server = (state: AppState, msg: ServerMessage) => gameReducer(state, { kind: "server", msg });
const play = (state: AppState, ...messages: ServerMessage[]) => messages.reduce(server, state);

const welcomed = () =>
  server(initialAppState, { type: "welcome", playerId: "p1", sessionToken: "tok" });

const room = (over: Partial<RoomStateMessage> = {}): RoomStateMessage => ({
  type: "roomState",
  phase: "in-progress",
  roundIndex: 0,
  roundCount: 10,
  deadlineAt: 20000,
  you: { seat: "a", name: "Riley", score: 0, submitted: false, table: [], hand: [] },
  opponent: { seat: "b", name: "Sam", score: 0, submitted: false, handCount: 5, table: [] },
  ...over,
});

test("welcome establishes identity and stores the reconnect token", () => {
  const state = welcomed();
  expect(state.identity).toEqual({ playerId: "p1", sessionToken: "tok" });
});

test("roomState replaces the board wholesale rather than merging", () => {
  const first = play(welcomed(), room({ roundIndex: 0 }));
  const second = play(
    first,
    room({
      roundIndex: 4,
      you: { seat: "a", name: "Riley", score: 9, submitted: true, table: [], hand: [] },
    }),
  );
  expect(second.room?.roundIndex).toBe(4);
  expect(second.room?.you.score).toBe(9);
  expect(second.room?.you.submitted).toBe(true);
});

test("entering a room clears the queue flag and any private code", () => {
  const queued = play(
    welcomed(),
    { type: "queueWaiting" },
    { type: "roomJoinedPrivate", code: "ABCD" },
  );
  expect(queued.queued).toBe(true);
  expect(queued.privateCode).toBe("ABCD");
  const playing = play(queued, room());
  expect(playing.queued).toBe(false);
  expect(playing.privateCode).toBeNull();
});

test("queueCancelled clears the queue flag", () => {
  const state = play(welcomed(), { type: "queueWaiting" }, { type: "queueCancelled" });
  expect(state.queued).toBe(false);
});

test("a rejection surfaces and each one re-triggers via an incrementing seq", () => {
  let state = play(welcomed(), room());
  state = server(state, { type: "actionRejected", code: "CARD_NOT_HELD", message: "nope" });
  expect(state.rejection).toMatchObject({ code: "CARD_NOT_HELD", message: "nope", seq: 1 });
  state = server(state, { type: "actionRejected", code: "CARD_NOT_HELD", message: "nope" });
  expect(state.rejection?.seq).toBe(2);
});

test("an accepted action clears a lingering rejection", () => {
  let state = play(welcomed(), room(), {
    type: "actionRejected",
    code: "BAD_TARGET",
    message: "no",
  });
  state = server(state, { type: "actionAccepted" });
  expect(state.rejection).toBeNull();
});

test("opponent disconnect and reconnect toggle the overlay state", () => {
  let state = play(welcomed(), room());
  state = server(state, { type: "opponentDisconnected", graceEndsAt: 30000 });
  expect(state.opponentDropped).toEqual({ graceEndsAt: 30000 });
  state = server(state, { type: "opponentReconnected" });
  expect(state.opponentDropped).toBeNull();
});

test("gameOver records the result without discarding the final board", () => {
  const state = play(welcomed(), room({ roundIndex: 10 }), {
    type: "gameOver",
    result: { kind: "draw", scores: { a: 12, b: 12 } },
  });
  expect(state.result).toEqual({ kind: "draw", scores: { a: 12, b: 12 } });
  expect(state.room?.roundIndex).toBe(10);
});

test("playAgain clears the game but keeps the session — no stale state across games", () => {
  let state = play(welcomed(), room({ roundIndex: 10 }), {
    type: "gameOver",
    result: { kind: "win", scores: { a: 20, b: 3 } },
  });
  state = server(state, { type: "actionRejected", code: "BAD_TARGET", message: "no" });
  state = gameReducer(state, { kind: "playAgain" });
  expect(state.room).toBeNull();
  expect(state.result).toBeNull();
  expect(state.rejection).toBeNull();
  expect(state.identity).not.toBeNull();
});

test("a second game starts clean rather than inheriting the first", () => {
  let state = play(welcomed(), room({ roundIndex: 10 }), {
    type: "gameOver",
    result: { kind: "win", scores: { a: 20, b: 3 } },
  });
  state = gameReducer(state, { kind: "playAgain" });
  state = play(state, { type: "queueWaiting" }, room({ roundIndex: 0 }));
  expect(state.room?.roundIndex).toBe(0);
  expect(state.result).toBeNull();
  expect(state.opponentDropped).toBeNull();
});

test("backToMenu drops the session but keeps the typed name", () => {
  let state = gameReducer(welcomed(), { kind: "nameChanged", name: "Riley" });
  state = play(state, room());
  state = gameReducer(state, { kind: "backToMenu" });
  expect(state.identity).toBeNull();
  expect(state.room).toBeNull();
  expect(state.name).toBe("Riley");
});

test("a protocol mismatch clears identity so the player lands back on connect", () => {
  const state = server(welcomed(), {
    type: "error",
    code: "PROTOCOL_MISMATCH",
    message: "Server speaks protocol 1.",
  });
  expect(state.identity).toBeNull();
  expect(state.connection.error).toContain("protocol");
});

test("roomLeft returns to the menu state without dropping the session", () => {
  let state = play(welcomed(), room());
  state = server(state, { type: "roomLeft" });
  expect(state.room).toBeNull();
  expect(state.queued).toBe(false);
  expect(state.identity).not.toBeNull();
});

test("a local rejection surfaces through the same channel, marked LOCAL", () => {
  const state = gameReducer(welcomed(), {
    kind: "localRejection",
    message: "Pick a card first.",
  });
  expect(state.rejection).toMatchObject({ code: "LOCAL", message: "Pick a card first.", seq: 1 });
});

test("pong changes nothing", () => {
  const before = play(welcomed(), room());
  expect(server(before, { type: "pong" })).toEqual(before);
});

test("creating a private room parks the player on the waiting screen with a code", () => {
  const state = play(welcomed(), { type: "roomJoinedPrivate", code: "0427" });
  expect(state.privateCode).toBe("0427");
});

test("cancelling clears a private code as well as the queue flag", () => {
  let state = play(welcomed(), { type: "roomJoinedPrivate", code: "0427" });
  state = server(state, { type: "queueCancelled" });
  expect(state.privateCode).toBeNull();
  expect(state.queued).toBe(false);
});

test("a guest joining by code lands in the room with no code left showing", () => {
  const state = play(welcomed(), { type: "roomJoinedPrivate", code: "0427" }, room());
  expect(state.privateCode).toBeNull();
  expect(state.room).not.toBeNull();
});
