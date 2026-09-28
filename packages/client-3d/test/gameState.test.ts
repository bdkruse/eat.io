import { expect, test } from "vitest";
import type { Profile, RoomStateMessage } from "@eat.io/protocol";
import {
  initialAppState,
  selectAwaitingYou,
  selectBoardFrozen,
  selectScreen,
  shouldShareGuestLook,
  type AppState,
} from "../src/state/gameState.js";

const room = (over: Partial<RoomStateMessage> = {}): RoomStateMessage => ({
  type: "roomState",
  mode: "match",
  phase: "in-progress",
  roundIndex: 0,
  roundCount: 10,
  deadlineAt: 20000,
  you: { seat: "a", name: "Riley", score: 0, submitted: false, appearance: null, table: [], hand: [], extraServings: [] },
  opponent: { seat: "b", name: "Sam", score: 0, submitted: false, appearance: null, handCount: 5, table: [], extraServings: [] },
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
    you: { seat: "a", name: "Riley", score: 0, submitted: true, appearance: null, table: [], hand: [], extraServings: [] },
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

const profile = (over: Partial<Profile> = {}): Profile => ({
  username: "Riley",
  role: "player",
  permissions: [],
  appearance: null,
  pointsScored: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  lunchMoney: 0,
  ownedItems: [],
  createdAt: 1_700_000_000_000,
  lastLoginAt: null,
  ...over,
});

test("shouldShareGuestLook: a guest connection shares its look", () => {
  expect(
    shouldShareGuestLook({ identitySet: true, account: null, accountPending: false }),
  ).toBe(true);
});

test("shouldShareGuestLook: a login or registration in flight is not yet a guest", () => {
  expect(
    shouldShareGuestLook({ identitySet: true, account: null, accountPending: true }),
  ).toBe(false);
});

test("shouldShareGuestLook: a logged-in player is never treated as a guest", () => {
  expect(
    shouldShareGuestLook({ identitySet: true, account: profile(), accountPending: false }),
  ).toBe(false);
});

test("shouldShareGuestLook: identity not yet established shares nothing", () => {
  expect(
    shouldShareGuestLook({ identitySet: false, account: null, accountPending: false }),
  ).toBe(false);
});

test("shouldShareGuestLook: a failed login attempt reverts to sharing the guest look", () => {
  // accountError clears accountPending while account stays null — this is the shape of
  // state right after a login or registration attempt fails.
  expect(
    shouldShareGuestLook({ identitySet: true, account: null, accountPending: false }),
  ).toBe(true);
});

test("shouldShareGuestLook: an expired resume reverts to sharing the guest look", () => {
  // accountLoggedOut clears accountPending while account stays null — the same shape as a
  // failed login, reached instead by a stored token the server rejected.
  expect(
    shouldShareGuestLook({ identitySet: true, account: null, accountPending: false }),
  ).toBe(true);
});
