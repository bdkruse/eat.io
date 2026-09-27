import { expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  type Appearance,
  type ClientMessage,
  type Profile,
  type Result,
  type RoomStateMessage,
  type ServerMessage,
  type WelcomeMessage,
} from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { manualTime } from "../src/lobby/timers.js";
import { Matchmaker } from "../src/lobby/matchmaking.js";
import { RoomRegistry } from "../src/lobby/registry.js";
import { Lobby, type Connection } from "../src/lobby/lobby.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { GameConfigStore, startupSettings } from "../src/gameConfig/gameConfigStore.js";
import { STARTING_DECK } from "../src/engine/rules/content.js";

const ROUND_COUNT = 2;
const MOVE_DEADLINE_MS = 20000;
const PASSWORD = "correct-horse";

const SUNNY_LOOK: Appearance = {
  skinTone: "#f6d7bf",
  hairStyle: "short",
  hairColor: "#2b2220",
  shirtColor: "#d94f3d",
  pantsColor: "#3f5a7a",
  accessory: "none",
};
const BREEZY_LOOK: Appearance = {
  skinTone: "#8d5634",
  hairStyle: "curly",
  hairColor: "#c4622d",
  shirtColor: "#4a7fa5",
  pantsColor: "#b59a6d",
  accessory: "glasses",
};

function makeLobby() {
  const time = manualTime();
  let playerSequence = 0, sessionTokenSequence = 0, codeSequence = 0;
  const config = loadConfig({
    RNG_SEED: "5",
    ROUND_COUNT: String(ROUND_COUNT),
    MOVE_DEADLINE_MS: String(MOVE_DEADLINE_MS),
  });
  const database = openAccountsDatabase(":memory:");
  const accounts = new AccountStore(database, time.clock);
  const gameConfig = new GameConfigStore(database, time.clock);
  gameConfig.ensureDefaults(startupSettings(config), STARTING_DECK);
  const lobby = new Lobby({
    config,
    clock: time.clock,
    timers: time.timers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(() => `C${++codeSequence}`),
    logger: createLogger("error"),
    genId: () => `player-${++playerSequence}`,
    genToken: () => `session-token-${++sessionTokenSequence}`,
    accounts,
    gameConfig,
  });
  return { lobby, time, accounts };
}

function connection() {
  const out: ServerMessage[] = [];
  const socket: Connection = { send: (message) => out.push(message), session: null };
  return { socket, out };
}
type TestConnection = ReturnType<typeof connection>;

function hello(name: string, tokens: { sessionToken?: string; loginToken?: string } = {}): ClientMessage {
  return { type: "hello", protocolVersion: PROTOCOL_VERSION, name, ...tokens };
}

function lastOf<Type extends ServerMessage["type"]>(
  out: ServerMessage[],
  type: Type,
): Extract<ServerMessage, { type: Type }> | undefined {
  return [...out].reverse().find((message) => message.type === type) as
    | Extract<ServerMessage, { type: Type }>
    | undefined;
}

function countOf(out: ServerMessage[], type: ServerMessage["type"]): number {
  return out.filter((message) => message.type === type).length;
}

/** A connected guest with a session. */
function guest(lobby: Lobby, name: string): TestConnection {
  const guestConnection = connection();
  lobby.handleMessage(guestConnection.socket, hello(name));
  return guestConnection;
}

/** A connected session that registers `username` and is logged in. */
function registered(lobby: Lobby, username: string): TestConnection {
  const accountConnection = guest(lobby, `guest-${username}`);
  lobby.handleMessage(accountConnection.socket, { type: "accountRegister", username, password: PASSWORD });
  return accountConnection;
}

/** A connected session that logs in to an existing `username`. */
function loggedIn(lobby: Lobby, username: string): TestConnection {
  const accountConnection = guest(lobby, `guest-${username}`);
  lobby.handleMessage(accountConnection.socket, { type: "accountLogin", username, password: PASSWORD });
  return accountConnection;
}

/** Lets every round run out on the move deadline, so the room auto-moves to the end. */
function playOutOnTheClock(time: ReturnType<typeof manualTime>): void {
  for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex++) time.advance(MOVE_DEADLINE_MS);
}

function accountIdOf(accounts: AccountStore, username: string): number {
  const account = accounts.findByUsername(username);
  if (!account) throw new Error(`no account ${username}`);
  return account.id;
}

test("register logs the session in with a login token, and the session takes the username", () => {
  const { lobby } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const loggedInMessage = lastOf(riley.out, "accountLoggedIn");
  expect(loggedInMessage?.loginToken).toMatch(/^[0-9a-f]{64}$/);
  expect(loggedInMessage?.profile.username).toBe("Riley_1");
  expect(riley.socket.session?.name).toBe("Riley_1");
});

test("wrong passwords get BAD_CREDENTIALS, then RATE_LIMITED, until the window passes", () => {
  const { lobby, time, accounts } = makeLobby();
  accounts.register("Riley_1", PASSWORD);
  const riley = guest(lobby, "Riley");
  for (let attempt = 0; attempt < 5; attempt++) {
    lobby.handleMessage(riley.socket, { type: "accountLogin", username: "Riley_1", password: "wrong-password" });
    expect(lastOf(riley.out, "accountError")).toEqual({
      type: "accountError",
      code: "BAD_CREDENTIALS",
      message: "Wrong username or password.",
    });
  }
  lobby.handleMessage(riley.socket, { type: "accountLogin", username: "Riley_1", password: PASSWORD });
  expect(lastOf(riley.out, "accountError")?.code).toBe("RATE_LIMITED");
  expect(lastOf(riley.out, "accountLoggedIn")).toBeUndefined();

  time.advance(60000);
  lobby.handleMessage(riley.socket, { type: "accountLogin", username: "Riley_1", password: PASSWORD });
  expect(lastOf(riley.out, "accountLoggedIn")?.profile.username).toBe("Riley_1");
});

test("registering while queued is BUSY", () => {
  const { lobby, accounts } = makeLobby();
  const riley = guest(lobby, "Riley");
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  lobby.handleMessage(riley.socket, { type: "accountRegister", username: "Riley_1", password: PASSWORD });
  expect(lastOf(riley.out, "accountError")?.code).toBe("BUSY");
  expect(accounts.findByUsername("Riley_1")).toBeNull();
});

test("a session that is already logged in cannot register or log in again", () => {
  const { lobby, accounts } = makeLobby();
  accounts.register("Sam_1", PASSWORD);
  const riley = registered(lobby, "Riley_1");
  const LOG_OUT_FIRST = { type: "accountError", code: "BUSY", message: "Log out first." } as const;

  lobby.handleMessage(riley.socket, { type: "accountRegister", username: "Riley_2", password: PASSWORD });
  expect(riley.out[riley.out.length - 1]).toEqual(LOG_OUT_FIRST);
  expect(accounts.findByUsername("Riley_2")).toBeNull();

  lobby.handleMessage(riley.socket, { type: "accountLogin", username: "Sam_1", password: PASSWORD });
  expect(riley.out[riley.out.length - 1]).toEqual(LOG_OUT_FIRST);
  expect(countOf(riley.out, "accountLoggedIn")).toBe(1);
  expect(riley.socket.session?.name).toBe("Riley_1");
});

test("hello with a valid login token resumes the account without a new token", () => {
  const { lobby, time, accounts } = makeLobby();
  const registration = accounts.register("Riley_1", PASSWORD);
  if (!registration.ok) throw new Error("setup failed");
  const loginToken = accounts.createLoginToken(registration.account.id);
  time.advance(5000);

  const riley = connection();
  lobby.handleMessage(riley.socket, hello("Riley", { loginToken }));
  expect(riley.out[0]?.type).toBe("welcome");
  const loggedInMessage = riley.out[1];
  expect(loggedInMessage?.type).toBe("accountLoggedIn");
  if (loggedInMessage?.type !== "accountLoggedIn") return;
  expect(loggedInMessage).not.toHaveProperty("loginToken");
  expect(loggedInMessage.profile.username).toBe("Riley_1");
  expect(loggedInMessage.profile.lastLoginAt).toBe(5000);
  expect(accounts.get(registration.account.id)?.lastLoginAt).toBe(5000);
  expect(riley.socket.session?.name).toBe("Riley_1");
});

test("hello with an unknown login token answers expired and continues as a guest", () => {
  const { lobby } = makeLobby();
  const riley = connection();
  lobby.handleMessage(riley.socket, hello("Riley", { loginToken: "no-such-token" }));
  expect(riley.out[0]?.type).toBe("welcome");
  expect(riley.out[1]).toEqual({ type: "accountLoggedOut", reason: "expired" });
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  expect(lastOf(riley.out, "queueWaiting")).toBeDefined();
});

test("a logged-in session that reconnects with its session token stays logged in", () => {
  const { lobby } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const sessionToken = (riley.out[0] as WelcomeMessage).sessionToken;
  const sam = guest(lobby, "Sam");
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  lobby.handleClose(riley.socket);

  const rileyAgain = connection();
  lobby.handleMessage(rileyAgain.socket, hello("Riley", { sessionToken }));
  lobby.handleMessage(rileyAgain.socket, { type: "profileRequest" });
  expect(lastOf(rileyAgain.out, "profile")?.profile.username).toBe("Riley_1");
});

test("a session dropped outside a room comes back logged in when the hello also carries the login token", () => {
  const { lobby } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const sessionToken = (riley.out[0] as WelcomeMessage).sessionToken;
  const loginToken = lastOf(riley.out, "accountLoggedIn")!.loginToken!;
  lobby.handleClose(riley.socket); // at the menu, so the server forgets the session

  const rileyAgain = connection();
  lobby.handleMessage(rileyAgain.socket, hello("Riley_1", { sessionToken, loginToken }));
  expect(rileyAgain.out.map((message) => message.type)).toEqual(["welcome", "accountLoggedIn"]);
  expect((rileyAgain.out[0] as WelcomeMessage).sessionToken).not.toBe(sessionToken);
  expect(lastOf(rileyAgain.out, "accountLoggedIn")?.profile.username).toBe("Riley_1");
  lobby.handleMessage(rileyAgain.socket, { type: "profileRequest" });
  expect(lastOf(rileyAgain.out, "profile")?.profile.username).toBe("Riley_1");
});

test("two sessions of one account never pair in the public queue", () => {
  const { lobby } = makeLobby();
  const rileyFirstTab = registered(lobby, "Riley_1");
  const rileySecondTab = loggedIn(lobby, "Riley_1");
  expect(lastOf(rileySecondTab.out, "accountLoggedIn")).toBeDefined();

  lobby.handleMessage(rileyFirstTab.socket, { type: "queueJoin" });
  lobby.handleMessage(rileySecondTab.socket, { type: "queueJoin" });
  expect(lastOf(rileyFirstTab.out, "roomState")).toBeUndefined();
  expect(lastOf(rileySecondTab.out, "queueWaiting")).toBeDefined();
  expect(lastOf(rileySecondTab.out, "roomState")).toBeUndefined();

  const sam = guest(lobby, "Sam");
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  expect(lastOf(rileyFirstTab.out, "roomState")).toBeDefined();
  expect(lastOf(sam.out, "roomState")).toBeDefined();
  expect(lastOf(rileySecondTab.out, "roomState")).toBeUndefined();
});

test("another account also pairs with the first waiting session", () => {
  const { lobby } = makeLobby();
  const rileyFirstTab = registered(lobby, "Riley_1");
  const rileySecondTab = loggedIn(lobby, "Riley_1");
  lobby.handleMessage(rileyFirstTab.socket, { type: "queueJoin" });
  lobby.handleMessage(rileySecondTab.socket, { type: "queueJoin" });

  const sam = registered(lobby, "Sam_2");
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  expect(lastOf(rileyFirstTab.out, "roomState")?.opponent.name).toBe("Sam_2");
  expect(lastOf(rileySecondTab.out, "roomState")).toBeUndefined();
});

test("a private room cannot be joined by another session of the same account", () => {
  const { lobby } = makeLobby();
  const rileyFirstTab = registered(lobby, "Riley_1");
  const rileySecondTab = loggedIn(lobby, "Riley_1");
  lobby.handleMessage(rileyFirstTab.socket, { type: "roomCreatePrivate" });
  const code = lastOf(rileyFirstTab.out, "roomJoinedPrivate")!.code;

  lobby.handleMessage(rileySecondTab.socket, { type: "roomJoinPrivate", code });
  expect(lastOf(rileySecondTab.out, "error")).toMatchObject({ message: "cannot join your own room" });
  expect(lastOf(rileyFirstTab.out, "roomState")).toBeUndefined();

  const sam = guest(lobby, "Sam");
  lobby.handleMessage(sam.socket, { type: "roomJoinPrivate", code });
  expect(lastOf(rileyFirstTab.out, "roomState")).toBeDefined();
  expect(lastOf(sam.out, "roomState")).toBeDefined();
});

test("a finished game records played, won, and points for each logged-in seat", () => {
  const { lobby, time, accounts } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const sam = registered(lobby, "Sam_2");
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  playOutOnTheClock(time);

  for (const [player, username] of [[riley, "Riley_1"], [sam, "Sam_2"]] as const) {
    const seat = lastOf(player.out, "roomState")!.you.seat;
    const result: Result = lastOf(player.out, "gameOver")!.result;
    const account = accounts.get(accountIdOf(accounts, username))!;
    expect(account.gamesPlayed).toBe(1);
    expect(account.gamesWon).toBe(result.kind === "win" ? 1 : 0);
    expect(account.pointsScored).toBe(result.scores[seat]);
    const profile: Profile | undefined = lastOf(player.out, "profile")?.profile;
    expect(profile).toEqual(accounts.profileOf(account));
    // The updated profile follows the game's result.
    expect(player.out.findIndex((message) => message.type === "profile")).toBeGreaterThan(
      player.out.findIndex((message) => message.type === "gameOver"),
    );
  }
});

test("a guest seat records nothing and gets no profile", () => {
  const { lobby, time, accounts } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const sam = guest(lobby, "Sam");
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  playOutOnTheClock(time);

  expect(lastOf(sam.out, "gameOver")).toBeDefined();
  expect(countOf(sam.out, "profile")).toBe(0);
  expect(accounts.get(accountIdOf(accounts, "Riley_1"))?.gamesPlayed).toBe(1);
  expect(countOf(riley.out, "profile")).toBe(1);
});

test("an abandoned room records nothing", () => {
  const { lobby, accounts } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const sam = registered(lobby, "Sam_2");
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  lobby.handleMessage(riley.socket, { type: "roomLeave" });

  expect(lastOf(sam.out, "roomState")?.phase).toBe("abandoned");
  for (const [player, username] of [[riley, "Riley_1"], [sam, "Sam_2"]] as const) {
    expect(accounts.get(accountIdOf(accounts, username))?.gamesPlayed).toBe(0);
    expect(countOf(player.out, "profile")).toBe(0);
  }
});

test("each player's appearance is on the board for both seats", () => {
  const { lobby } = makeLobby();
  const riley = guest(lobby, "Riley");
  const sam = guest(lobby, "Sam");
  lobby.handleMessage(riley.socket, { type: "appearanceSet", appearance: SUNNY_LOOK });
  lobby.handleMessage(sam.socket, { type: "appearanceSet", appearance: BREEZY_LOOK });
  lobby.handleMessage(riley.socket, { type: "queueJoin" });
  lobby.handleMessage(sam.socket, { type: "queueJoin" });

  const rileyView: RoomStateMessage = lastOf(riley.out, "roomState")!;
  const samView: RoomStateMessage = lastOf(sam.out, "roomState")!;
  expect(rileyView.you.appearance).toEqual(SUNNY_LOOK);
  expect(rileyView.opponent.appearance).toEqual(BREEZY_LOOK);
  expect(samView.you.appearance).toEqual(BREEZY_LOOK);
  expect(samView.opponent.appearance).toEqual(SUNNY_LOOK);

  const alex = guest(lobby, "Alex");
  const jordan = guest(lobby, "Jordan");
  lobby.handleMessage(alex.socket, { type: "appearanceSet", appearance: SUNNY_LOOK });
  lobby.handleMessage(alex.socket, { type: "queueJoin" });
  lobby.handleMessage(jordan.socket, { type: "queueJoin" });
  expect(lastOf(alex.out, "roomState")?.opponent.appearance).toBeNull();
  expect(lastOf(jordan.out, "roomState")?.you.appearance).toBeNull();
  expect(lastOf(jordan.out, "roomState")?.opponent.appearance).toEqual(SUNNY_LOOK);
});

test("a guest's look is saved to a new account, and a logged-in look change is saved", () => {
  const { lobby, accounts } = makeLobby();
  const riley = guest(lobby, "Riley");
  lobby.handleMessage(riley.socket, { type: "appearanceSet", appearance: SUNNY_LOOK });
  lobby.handleMessage(riley.socket, { type: "accountRegister", username: "Riley_1", password: PASSWORD });
  expect(lastOf(riley.out, "accountLoggedIn")?.profile.appearance).toEqual(SUNNY_LOOK);
  expect(accounts.findByUsername("Riley_1")?.appearance).toEqual(SUNNY_LOOK);

  lobby.handleMessage(riley.socket, { type: "appearanceSet", appearance: BREEZY_LOOK });
  expect(accounts.findByUsername("Riley_1")?.appearance).toEqual(BREEZY_LOOK);

  // A later login on a fresh session wears the account's look.
  const rileyElsewhere = loggedIn(lobby, "Riley_1");
  const sam = guest(lobby, "Sam");
  lobby.handleMessage(rileyElsewhere.socket, { type: "queueJoin" });
  lobby.handleMessage(sam.socket, { type: "queueJoin" });
  expect(lastOf(sam.out, "roomState")?.opponent.appearance).toEqual(BREEZY_LOOK);
});

test("changing the password keeps this session's token and drops the others", () => {
  const { lobby, accounts } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const ownLoginToken = lastOf(riley.out, "accountLoggedIn")!.loginToken!;
  const otherLoginToken = accounts.createLoginToken(accountIdOf(accounts, "Riley_1"));

  lobby.handleMessage(riley.socket, {
    type: "accountChangePassword",
    currentPassword: PASSWORD,
    newPassword: "battery-staple",
  });
  expect(lastOf(riley.out, "passwordChanged")).toEqual({ type: "passwordChanged" });
  expect(accounts.resumeLoginToken(ownLoginToken)?.username).toBe("Riley_1");
  expect(accounts.resumeLoginToken(otherLoginToken)).toBeNull();
});

test("wrong current passwords count toward the guard", () => {
  const { lobby } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  for (let attempt = 0; attempt < 5; attempt++) {
    lobby.handleMessage(riley.socket, {
      type: "accountChangePassword",
      currentPassword: "wrong-password",
      newPassword: "battery-staple",
    });
    expect(lastOf(riley.out, "accountError")?.code).toBe("WRONG_PASSWORD");
  }
  lobby.handleMessage(riley.socket, {
    type: "accountChangePassword",
    currentPassword: PASSWORD,
    newPassword: "battery-staple",
  });
  expect(lastOf(riley.out, "accountError")?.code).toBe("RATE_LIMITED");
  expect(lastOf(riley.out, "passwordChanged")).toBeUndefined();
});

test("logout answers requested, and the login token no longer resumes", () => {
  const { lobby, accounts } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const loginToken = lastOf(riley.out, "accountLoggedIn")!.loginToken!;
  lobby.handleMessage(riley.socket, { type: "accountLogout" });
  expect(lastOf(riley.out, "accountLoggedOut")).toEqual({ type: "accountLoggedOut", reason: "requested" });
  expect(accounts.resumeLoginToken(loginToken)).toBeNull();
  expect(riley.socket.session?.name).toBe("guest-Riley_1");

  lobby.handleMessage(riley.socket, { type: "profileRequest" });
  expect(lastOf(riley.out, "accountError")?.code).toBe("NOT_LOGGED_IN");
});

test("a guest gets NOT_LOGGED_IN for logout, password change, and profile", () => {
  const { lobby } = makeLobby();
  const riley = guest(lobby, "Riley");
  const accountOnlyMessages: ClientMessage[] = [
    { type: "accountLogout" },
    { type: "accountChangePassword", currentPassword: PASSWORD, newPassword: "battery-staple" },
    { type: "profileRequest" },
  ];
  for (const message of accountOnlyMessages) {
    lobby.handleMessage(riley.socket, message);
    expect(lastOf(riley.out, "accountError")?.code).toBe("NOT_LOGGED_IN");
  }
  expect(countOf(riley.out, "accountError")).toBe(3);
});

const ALREADY_GREETED = {
  type: "error",
  code: "ALREADY_GREETED",
  message: "This connection already has a session.",
} as const;

test("a second hello on the same connection is refused and does not reset the login guard", () => {
  const { lobby, accounts } = makeLobby();
  accounts.register("Riley_1", PASSWORD);
  const riley = guest(lobby, "Riley");
  const sessionBefore = riley.socket.session;
  for (let attempt = 0; attempt < 5; attempt++) {
    lobby.handleMessage(riley.socket, { type: "accountLogin", username: "Riley_1", password: "wrong-password" });
  }

  lobby.handleMessage(riley.socket, hello("Riley"));
  expect(riley.out[riley.out.length - 1]).toEqual(ALREADY_GREETED);
  expect(riley.socket.session).toBe(sessionBefore);
  expect(countOf(riley.out, "welcome")).toBe(1);

  lobby.handleMessage(riley.socket, { type: "accountLogin", username: "Riley_1", password: PASSWORD });
  expect(lastOf(riley.out, "accountError")?.code).toBe("RATE_LIMITED");
  expect(lastOf(riley.out, "accountLoggedIn")).toBeUndefined();
});

test("a second hello with a login token cannot reset the guard on password changes", () => {
  const { lobby } = makeLobby();
  const riley = registered(lobby, "Riley_1");
  const loginToken = lastOf(riley.out, "accountLoggedIn")!.loginToken!;
  const sessionBefore = riley.socket.session;
  for (let attempt = 0; attempt < 5; attempt++) {
    lobby.handleMessage(riley.socket, {
      type: "accountChangePassword",
      currentPassword: "wrong-password",
      newPassword: "battery-staple",
    });
  }

  lobby.handleMessage(riley.socket, hello("Riley", { loginToken }));
  expect(riley.out[riley.out.length - 1]).toEqual(ALREADY_GREETED);
  expect(riley.socket.session).toBe(sessionBefore);
  expect(countOf(riley.out, "accountLoggedIn")).toBe(1);

  lobby.handleMessage(riley.socket, {
    type: "accountChangePassword",
    currentPassword: PASSWORD,
    newPassword: "battery-staple",
  });
  expect(lastOf(riley.out, "accountError")?.code).toBe("RATE_LIMITED");
  expect(lastOf(riley.out, "passwordChanged")).toBeUndefined();
});
