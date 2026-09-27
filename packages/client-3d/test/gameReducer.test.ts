import { expect, test } from "vitest";
import type { Profile, RoomStateMessage, ServerMessage } from "@eat.io/protocol";
import {
  initialAppState,
  selectAdminMessages,
  selectBackToMenuStaysConnected,
  selectScreen,
  type AppState,
} from "../src/state/gameState.js";
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
  you: { seat: "a", name: "Riley", score: 0, submitted: false, appearance: null, table: [], hand: [], extraServings: [] },
  opponent: { seat: "b", name: "Sam", score: 0, submitted: false, appearance: null, handCount: 5, table: [], extraServings: [] },
  ...over,
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  username: "Riley",
  role: "player",
  permissions: [],
  appearance: null,
  pointsScored: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  createdAt: 1_700_000_000_000,
  lastLoginAt: null,
  ...over,
});

const settingsMessage = (over: Partial<Extract<ServerMessage, { type: "settings" }>> = {}) => ({
  type: "settings" as const,
  settings: { roundCount: 20, turnSeconds: 20, handSize: 5 },
  updatedAt: null,
  updatedBy: null,
  ...over,
});

const deckMessage = (over: Partial<Extract<ServerMessage, { type: "deck" }>> = {}) => ({
  type: "deck" as const,
  cards: [
    { id: "add1x1", name: "Add One Food To One Tray", action: "add" as const, amount: 1, targets: 1, copies: 5 },
  ],
  total: 5,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

const adminErrorMessage = (over: Partial<Extract<ServerMessage, { type: "adminError" }>> = {}) => ({
  type: "adminError" as const,
  code: "INVALID_SETTINGS" as const,
  message: "Round count must be a whole number between 1 and 30.",
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
      you: { seat: "a", name: "Riley", score: 9, submitted: true, appearance: null, table: [], hand: [], extraServings: [] },
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

test("accountLoggedIn stores the profile and clears a lingering account error", () => {
  let state = server(welcomed(), {
    type: "accountError",
    code: "BAD_CREDENTIALS",
    message: "nope",
  });
  state = server(state, { type: "accountLoggedIn", profile: profile() });
  expect(state.account).toEqual(profile());
  expect(state.accountError).toBeNull();
});

test("profile replaces the stored account", () => {
  let state = server(welcomed(), { type: "accountLoggedIn", profile: profile() });
  state = server(state, { type: "profile", profile: profile({ pointsScored: 40 }) });
  expect(state.account?.pointsScored).toBe(40);
});

test("accountLoggedOut clears the account", () => {
  let state = server(welcomed(), { type: "accountLoggedIn", profile: profile() });
  state = server(state, { type: "accountLoggedOut", reason: "requested" });
  expect(state.account).toBeNull();
});

test("accountError surfaces and each one re-triggers via an incrementing seq", () => {
  let state = server(welcomed(), {
    type: "accountError",
    code: "USERNAME_TAKEN",
    message: "That name is taken.",
  });
  expect(state.accountError).toMatchObject({
    code: "USERNAME_TAKEN",
    message: "That name is taken.",
    seq: 1,
  });
  state = server(state, {
    type: "accountError",
    code: "USERNAME_TAKEN",
    message: "That name is taken.",
  });
  expect(state.accountError?.seq).toBe(2);
});

test("passwordChanged surfaces a one-shot notice", () => {
  const state = server(welcomed(), { type: "passwordChanged" });
  expect(state.accountNotice).toMatchObject({ text: "Password changed.", seq: 1 });
});

test("dismissAccountError clears the error without touching the account", () => {
  let state = server(welcomed(), { type: "accountLoggedIn", profile: profile() });
  state = server(state, { type: "accountError", code: "WRONG_PASSWORD", message: "no" });
  state = gameReducer(state, { kind: "dismissAccountError" });
  expect(state.accountError).toBeNull();
  expect(state.account).toEqual(profile());
});

test("backToMenu clears the account, its error, and any notice", () => {
  let state = server(welcomed(), { type: "accountLoggedIn", profile: profile() });
  state = server(state, { type: "passwordChanged" });
  state = gameReducer(state, { kind: "backToMenu" });
  expect(state.account).toBeNull();
  expect(state.accountError).toBeNull();
  expect(state.accountNotice).toBeNull();
});

test("a reconnect's fresh welcome does not clear the logged-in account", () => {
  let state = server(welcomed(), { type: "accountLoggedIn", profile: profile() });
  state = server(state, { type: "welcome", playerId: "p1", sessionToken: "tok2" });
  expect(state.account).toEqual(profile());
});

test("a connection-phase change does not clear the logged-in account", () => {
  let state = server(welcomed(), { type: "accountLoggedIn", profile: profile() });
  state = gameReducer(state, {
    kind: "connection",
    state: { phase: "reconnecting", error: null, attempt: 1 },
  });
  expect(state.account).toEqual(profile());
});

test("accountAttemptStarted marks an account attempt in flight", () => {
  const state = gameReducer(welcomed(), { kind: "accountAttemptStarted" });
  expect(state.accountPending).toBe(true);
});

test("accountLoggedIn clears a pending account attempt", () => {
  let state = gameReducer(welcomed(), { kind: "accountAttemptStarted" });
  state = server(state, { type: "accountLoggedIn", profile: profile() });
  expect(state.accountPending).toBe(false);
});

test("accountLoggedOut clears a pending account attempt", () => {
  let state = gameReducer(welcomed(), { kind: "accountAttemptStarted" });
  state = server(state, { type: "accountLoggedOut", reason: "expired" });
  expect(state.accountPending).toBe(false);
});

test("accountError clears a pending account attempt", () => {
  let state = gameReducer(welcomed(), { kind: "accountAttemptStarted" });
  state = server(state, { type: "accountError", code: "BAD_CREDENTIALS", message: "nope" });
  expect(state.accountPending).toBe(false);
});

test("backToMenu clears a pending account attempt", () => {
  let state = gameReducer(welcomed(), { kind: "accountAttemptStarted" });
  state = gameReducer(state, { kind: "backToMenu" });
  expect(state.accountPending).toBe(false);
});

test("backToConnectedMenu keeps a logged-in player's session and account", () => {
  let state = gameReducer(welcomed(), { kind: "nameChanged", name: "Riley" });
  state = play(
    state,
    { type: "accountLoggedIn", profile: profile() },
    room({ roundIndex: 10 }),
    { type: "opponentDisconnected", graceEndsAt: 30000 },
    { type: "actionRejected", code: "BAD_TARGET", message: "no" },
    { type: "gameOver", result: { kind: "win", scores: { a: 20, b: 3 } } },
  );
  state = gameReducer(state, { kind: "connection", state: { phase: "connected", error: null, attempt: 0 } });
  state = gameReducer(state, { kind: "backToConnectedMenu" });
  expect(state.room).toBeNull();
  expect(state.result).toBeNull();
  expect(state.queued).toBe(false);
  expect(state.privateCode).toBeNull();
  expect(state.rejection).toBeNull();
  expect(state.opponentDropped).toBeNull();
  expect(state.identity).toEqual({ playerId: "p1", sessionToken: "tok" });
  expect(state.account).toEqual(profile());
  expect(state.connection.phase).toBe("connected");
  expect(state.name).toBe("Riley");
  expect(selectScreen(state)).toBe("connect");
});

test("Back to menu stays connected only for a logged-in player", () => {
  const guestState = play(welcomed(), room());
  const loggedInState = play(welcomed(), { type: "accountLoggedIn", profile: profile() }, room());
  expect(selectBackToMenuStaysConnected(guestState)).toBe(false);
  expect(selectBackToMenuStaysConnected(loggedInState)).toBe(true);
});

test("a requested logout returns to the pre-connect menu, keeping the typed name", () => {
  let state = gameReducer(welcomed(), { kind: "nameChanged", name: "Riley" });
  state = play(state, { type: "accountLoggedIn", profile: profile() }, { type: "passwordChanged" });
  state = server(state, { type: "accountLoggedOut", reason: "requested" });
  expect(state.identity).toBeNull();
  expect(state.account).toBeNull();
  expect(state.accountNotice).toBeNull();
  expect(state.name).toBe("Riley");
  expect(selectScreen(state)).toBe("connect");
});

test("an expired resume returns to the pre-connect menu with no name invented for the player", () => {
  let state = gameReducer(initialAppState, { kind: "accountAttemptStarted" });
  state = play(
    state,
    { type: "welcome", playerId: "p1", sessionToken: "tok" },
    { type: "accountLoggedOut", reason: "expired" },
  );
  expect(state.identity).toBeNull();
  expect(state.accountPending).toBe(false);
  expect(state.name).toBe("");
  expect(selectScreen(state)).toBe("connect");
});

test("settingsSaveStarted marks a settings save in flight", () => {
  const state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  expect(state.savingSettings).toBe(true);
});

test("a settings message with no save in flight stores the settings but raises no notice", () => {
  const state = server(welcomed(), settingsMessage());
  expect(state.adminSettings).toEqual({
    settings: { roundCount: 20, turnSeconds: 20, handSize: 5 },
    updatedAt: null,
    updatedBy: null,
  });
  expect(state.adminNotice).toBeNull();
  expect(state.savingSettings).toBe(false);
});

test("a settings message answering a save clears the in-flight flag and raises a notice, re-triggering via seq on a repeat", () => {
  let state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  state = server(state, settingsMessage({ updatedAt: 1_700_000_000_000, updatedBy: "Riley" }));
  expect(state.savingSettings).toBe(false);
  expect(state.adminSettings?.updatedBy).toBe("Riley");
  expect(state.adminNotice).toMatchObject({ seq: 1 });

  state = gameReducer(state, { kind: "settingsSaveStarted" });
  state = server(state, settingsMessage({ updatedAt: 1_700_000_001_000, updatedBy: "Riley" }));
  expect(state.adminNotice?.seq).toBe(2);
});

test("deckSaveStarted marks a deck save in flight", () => {
  const state = gameReducer(welcomed(), { kind: "deckSaveStarted" });
  expect(state.savingDeck).toBe(true);
});

test("a deck message with no save in flight stores the deck but raises no notice", () => {
  const state = server(welcomed(), deckMessage());
  expect(state.adminDeck?.total).toBe(5);
  expect(state.adminNotice).toBeNull();
  expect(state.savingDeck).toBe(false);
});

test("a deck message answering a save clears the in-flight flag and raises a notice, re-triggering via seq on a repeat", () => {
  let state = gameReducer(welcomed(), { kind: "deckSaveStarted" });
  state = server(state, deckMessage({ updatedAt: 1_700_000_000_000, updatedBy: "Jae" }));
  expect(state.savingDeck).toBe(false);
  expect(state.adminDeck?.updatedBy).toBe("Jae");
  expect(state.adminNotice).toMatchObject({ seq: 1 });

  state = gameReducer(state, { kind: "deckSaveStarted" });
  state = server(state, deckMessage({ updatedAt: 1_700_000_001_000, updatedBy: "Jae" }));
  expect(state.adminNotice?.seq).toBe(2);
});

test("adminError surfaces and each one re-triggers via an incrementing seq, clearing any save in flight", () => {
  let state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  state = server(state, adminErrorMessage());
  expect(state.savingSettings).toBe(false);
  expect(state.adminError).toMatchObject({ code: "INVALID_SETTINGS", seq: 1 });

  state = server(state, adminErrorMessage());
  expect(state.adminError?.seq).toBe(2);
});

test("adminError also clears a deck save in flight", () => {
  const state = server(
    gameReducer(welcomed(), { kind: "deckSaveStarted" }),
    adminErrorMessage({ code: "INVALID_DECK", message: "The deck must total between 10 and 100 cards, not 5." }),
  );
  expect(state.savingDeck).toBe(false);
  expect(state.adminError?.code).toBe("INVALID_DECK");
});

test("backToMenu clears the admin settings, deck, error, and notice along with everything else", () => {
  let state = server(welcomed(), settingsMessage());
  state = server(state, deckMessage());
  state = server(state, adminErrorMessage());
  state = gameReducer(state, { kind: "backToMenu" });
  expect(state.adminSettings).toBeNull();
  expect(state.adminDeck).toBeNull();
  expect(state.adminError).toBeNull();
  expect(state.adminNotice).toBeNull();
});

// ---------- fix round 1: fresh replies on reopen, and notices/errors per subject ----------

test("requesting settings drops the cached settings, so a reopened panel waits for the fresh reply", () => {
  let state = server(welcomed(), settingsMessage({ updatedBy: "Riley" }));
  state = gameReducer(state, { kind: "settingsRequested" });
  expect(state.adminSettings).toBeNull();
  state = server(state, settingsMessage({ settings: { roundCount: 12, turnSeconds: 30, handSize: 6 }, updatedBy: "Sam" }));
  expect(state.adminSettings?.settings.roundCount).toBe(12);
  expect(state.adminSettings?.updatedBy).toBe("Sam");
});

test("requesting the deck drops the cached deck, so a reopened panel waits for the fresh reply", () => {
  let state = server(welcomed(), deckMessage());
  state = gameReducer(state, { kind: "deckRequested" });
  expect(state.adminDeck).toBeNull();
});

test("opening either panel clears any notice or error left from before", () => {
  let state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  state = server(state, settingsMessage());
  state = server(state, adminErrorMessage());
  expect(state.adminError).not.toBeNull();
  const reopenedSettings = gameReducer(state, { kind: "settingsRequested" });
  expect(reopenedSettings.adminNotice).toBeNull();
  expect(reopenedSettings.adminError).toBeNull();

  let deckState = gameReducer(welcomed(), { kind: "deckSaveStarted" });
  deckState = server(deckState, deckMessage());
  expect(deckState.adminNotice).not.toBeNull();
  const reopenedDeck = gameReducer(deckState, { kind: "deckRequested" });
  expect(reopenedDeck.adminNotice).toBeNull();
  expect(reopenedDeck.adminError).toBeNull();
});

test("starting a save clears the previous notice and error", () => {
  let state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  state = server(state, adminErrorMessage());
  state = gameReducer(state, { kind: "settingsSaveStarted" });
  expect(state.adminError).toBeNull();

  state = server(state, settingsMessage());
  expect(state.adminNotice).not.toBeNull();
  state = gameReducer(state, { kind: "deckSaveStarted" });
  expect(state.adminNotice).toBeNull();
});

test("a successful save clears an earlier error", () => {
  let state = gameReducer(welcomed(), { kind: "deckSaveStarted" });
  state = server(state, adminErrorMessage({ code: "INVALID_DECK", message: "The deck must total between 10 and 100 cards, not 5." }));
  // A save answer that arrives while the error is still up (no new saveStarted in between).
  state = { ...state, savingDeck: true };
  state = server(state, deckMessage());
  expect(state.adminNotice?.text).toBe("Deck saved.");
  expect(state.adminError).toBeNull();
});

test("an error clears an earlier notice", () => {
  let state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  state = server(state, settingsMessage());
  expect(state.adminNotice?.text).toBe("Settings saved.");
  state = server(state, adminErrorMessage());
  expect(state.adminNotice).toBeNull();
  expect(state.adminError).not.toBeNull();
});

test("a settings notice or error never shows in the creator panel", () => {
  let state = gameReducer(welcomed(), { kind: "settingsSaveStarted" });
  state = server(state, settingsMessage());
  expect(selectAdminMessages(state, "settings").notice?.text).toBe("Settings saved.");
  expect(selectAdminMessages(state, "deck")).toEqual({ notice: null, error: null });

  state = gameReducer(state, { kind: "settingsSaveStarted" });
  state = server(state, adminErrorMessage());
  expect(selectAdminMessages(state, "settings").error?.code).toBe("INVALID_SETTINGS");
  expect(selectAdminMessages(state, "deck")).toEqual({ notice: null, error: null });
});

test("a deck notice or error never shows in the admin panel", () => {
  let state = gameReducer(welcomed(), { kind: "deckSaveStarted" });
  state = server(state, deckMessage());
  expect(selectAdminMessages(state, "deck").notice?.text).toBe("Deck saved.");
  expect(selectAdminMessages(state, "settings")).toEqual({ notice: null, error: null });

  state = gameReducer(state, { kind: "deckSaveStarted" });
  state = server(state, adminErrorMessage({ code: "INVALID_DECK", message: "The deck must total between 10 and 100 cards, not 5." }));
  expect(selectAdminMessages(state, "deck").error?.code).toBe("INVALID_DECK");
  expect(selectAdminMessages(state, "settings")).toEqual({ notice: null, error: null });
});

test("a FORBIDDEN error belongs to the save in flight, or else to the panel that last asked", () => {
  const duringDeckSave = server(
    gameReducer(welcomed(), { kind: "deckSaveStarted" }),
    adminErrorMessage({ code: "FORBIDDEN", message: "You cannot edit the deck." }),
  );
  expect(selectAdminMessages(duringDeckSave, "deck").error?.code).toBe("FORBIDDEN");
  expect(selectAdminMessages(duringDeckSave, "settings").error).toBeNull();

  const afterDeckRequest = server(
    gameReducer(welcomed(), { kind: "deckRequested" }),
    adminErrorMessage({ code: "FORBIDDEN", message: "You cannot edit the deck." }),
  );
  expect(selectAdminMessages(afterDeckRequest, "deck").error?.code).toBe("FORBIDDEN");
});

test("an error for one subject leaves the other subject's save in flight", () => {
  let state = gameReducer(welcomed(), { kind: "deckSaveStarted" });
  state = gameReducer(state, { kind: "settingsSaveStarted" });
  state = server(state, adminErrorMessage());
  expect(state.savingSettings).toBe(false);
  expect(state.savingDeck).toBe(true);
});
