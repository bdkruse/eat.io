import { expect, test } from "vitest";
import type { RoomStateMessage } from "@eat.io/protocol";
import {
  initialAppState,
  selectAwaitingYou,
  selectBoardFrozen,
  selectScreen,
  type AppState,
} from "../src/state/gameState.js";

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

const seated = (over: Partial<AppState> = {}): AppState => ({
  ...initialAppState,
  identity: { playerId: "p1", sessionToken: "tok" },
  connection: { phase: "connected", error: null, attempt: 0 },
  ...over,
});

test("no identity means the connect screen, whatever else is set", () => {
  expect(selectScreen(initialAppState)).toBe("connect");
  expect(selectScreen({ ...initialAppState, queued: true })).toBe("connect");
});

test("screens are derived in priority order: result, then room, then queue", () => {
  expect(selectScreen(seated({ queued: true }))).toBe("queue");
  expect(selectScreen(seated({ room: room() }))).toBe("game");
  expect(
    selectScreen(seated({ room: room(), result: { kind: "win", scores: { a: 3, b: 1 } } })),
  ).toBe("gameOver");
});

test("awaiting-you is explicit, never inferred from a round index", () => {
  expect(selectAwaitingYou(seated({ room: room() }))).toBe(true);
  const submitted = room({
    you: { seat: "a", name: "Riley", score: 0, submitted: true, table: [], hand: [] },
  });
  expect(selectAwaitingYou(seated({ room: submitted }))).toBe(false);
  expect(selectAwaitingYou(seated({ room: room({ phase: "paused" }) }))).toBe(false);
});

test("the board is frozen whenever the socket is not live", () => {
  expect(selectBoardFrozen(seated({ room: room() }))).toBe(false);
  expect(
    selectBoardFrozen(
      seated({ room: room(), connection: { phase: "reconnecting", error: null, attempt: 1 } }),
    ),
  ).toBe(true);
});

test("a connected player with nothing in flight stays on connect to choose how to play", () => {
  // Regression: an earlier build assumed `welcome` alone moved you off the Connect screen,
  // which left the player connected but stranded with no way to enter a game.
  expect(selectScreen(seated())).toBe("connect");
});

test("holding a private room code shows the waiting screen", () => {
  expect(selectScreen(seated({ privateCode: "0427" }))).toBe("queue");
});
