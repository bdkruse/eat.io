import { describe, expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  deckProblem,
  settingsProblem,
  type ClientMessage,
  type DeckEntry,
  type GameSettings,
  type Role,
  type RoomStateMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createLogger, type Logger } from "../src/logger.js";
import { manualTime } from "../src/lobby/timers.js";
import { Matchmaker } from "../src/lobby/matchmaking.js";
import { RoomRegistry } from "../src/lobby/registry.js";
import { Lobby, type Connection } from "../src/lobby/lobby.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { GameConfigStore, startupSettings } from "../src/gameConfig/gameConfigStore.js";
import { CARD_CATALOG, STARTING_DECK } from "../src/engine/rules/content.js";

const PASSWORD = "correct-horse";
const CATALOG_CARD_IDS = CARD_CATALOG.map((card) => card.id);

interface LobbyOptions {
  /** The deck `ensureDefaults` seeds; the starting deck unless a test needs another. */
  seededDeck?: readonly DeckEntry[];
}

function makeLobby(options: LobbyOptions = {}) {
  const time = manualTime();
  let playerSequence = 0, sessionTokenSequence = 0, codeSequence = 0;
  const config = loadConfig({ RNG_SEED: "5" });
  const database = openAccountsDatabase(":memory:");
  const accounts = new AccountStore(database, time.clock);
  const gameConfig = new GameConfigStore(database, time.clock);
  gameConfig.ensureDefaults(startupSettings(config), options.seededDeck ?? STARTING_DECK);
  const warnings: string[] = [];
  const quietLogger = createLogger("error");
  const logger: Logger = { ...quietLogger, warn: (message) => warnings.push(message) };
  const lobby = new Lobby({
    config,
    clock: time.clock,
    timers: time.timers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(() => `C${++codeSequence}`),
    logger,
    genId: () => `player-${++playerSequence}`,
    genToken: () => `session-token-${++sessionTokenSequence}`,
    accounts,
    gameConfig,
  });
  return { lobby, time, accounts, gameConfig, warnings };
}
type TestLobby = ReturnType<typeof makeLobby>;

function connection() {
  const out: ServerMessage[] = [];
  const socket: Connection = { send: (message) => out.push(message), session: null };
  return { socket, out };
}
type TestConnection = ReturnType<typeof connection>;

function hello(name: string): ClientMessage {
  return { type: "hello", protocolVersion: PROTOCOL_VERSION, name };
}

function lastOf<Type extends ServerMessage["type"]>(
  out: ServerMessage[],
  type: Type,
): Extract<ServerMessage, { type: Type }> | undefined {
  return [...out].reverse().find((message) => message.type === type) as
    | Extract<ServerMessage, { type: Type }>
    | undefined;
}

function lastRoomState(out: ServerMessage[]): RoomStateMessage {
  const roomState = lastOf(out, "roomState");
  if (!roomState) throw new Error("no roomState yet");
  return roomState;
}

function guest(testLobby: TestLobby, name: string): TestConnection {
  const guestConnection = connection();
  testLobby.lobby.handleMessage(guestConnection.socket, hello(name));
  return guestConnection;
}

/** A logged-in session whose account holds `role`. */
function account(testLobby: TestLobby, username: string, role: Role): TestConnection {
  const accountConnection = guest(testLobby, `guest-${username}`);
  testLobby.lobby.handleMessage(accountConnection.socket, { type: "accountRegister", username, password: PASSWORD });
  const record = testLobby.accounts.findByUsername(username);
  if (!record) throw new Error(`no account ${username}`);
  testLobby.accounts.setRole(record.id, role);
  return accountConnection;
}

function send(testLobby: TestLobby, sender: TestConnection, message: ClientMessage): ServerMessage | undefined {
  const sentBefore = sender.out.length;
  testLobby.lobby.handleMessage(sender.socket, message);
  return sender.out.slice(sentBefore).at(-1);
}

function settingsSave(settings: GameSettings): ClientMessage {
  return { type: "settingsSave", ...settings };
}

function deckSave(cards: DeckEntry[]): ClientMessage {
  return { type: "deckSave", cards };
}

/** Two guests queue up and are seated together. Returns both connections. */
function startRoom(testLobby: TestLobby): [TestConnection, TestConnection] {
  const firstPlayer = guest(testLobby, "Riley");
  const secondPlayer = guest(testLobby, "Sam");
  testLobby.lobby.handleMessage(firstPlayer.socket, { type: "queueJoin" });
  testLobby.lobby.handleMessage(secondPlayer.socket, { type: "queueJoin" });
  return [firstPlayer, secondPlayer];
}

const ALL_ADMIN_MESSAGES: ClientMessage[] = [
  { type: "settingsRequest" },
  settingsSave({ roundCount: 5, turnSeconds: 10, handSize: 4 }),
  { type: "deckRequest" },
  deckSave([{ cardId: "add1x1", copies: 20 }]),
];

const ONLY_ADD_THREE: DeckEntry[] = [{ cardId: "add3x1", copies: 12 }];

describe("permissions", () => {
  test("a guest is refused all four admin messages", () => {
    const testLobby = makeLobby();
    const guestConnection = guest(testLobby, "Riley");
    for (const message of ALL_ADMIN_MESSAGES) {
      const reply = send(testLobby, guestConnection, message);
      expect(reply).toMatchObject({ type: "adminError", code: "FORBIDDEN" });
    }
    expect(testLobby.gameConfig.getSettings().updatedBy).toBeNull();
    expect(testLobby.gameConfig.getDeck().updatedBy).toBeNull();
  });

  test("a Player is refused all four admin messages", () => {
    const testLobby = makeLobby();
    const playerConnection = account(testLobby, "plainplayer", "player");
    for (const message of ALL_ADMIN_MESSAGES) {
      const reply = send(testLobby, playerConnection, message);
      expect(reply).toMatchObject({ type: "adminError", code: "FORBIDDEN" });
    }
    expect(testLobby.gameConfig.getSettings().updatedBy).toBeNull();
    expect(testLobby.gameConfig.getDeck().updatedBy).toBeNull();
  });

  test("an Admin can read and save settings, but the deck is FORBIDDEN", () => {
    const testLobby = makeLobby();
    const adminConnection = account(testLobby, "theadmin", "admin");
    testLobby.time.advance(1234);

    expect(send(testLobby, adminConnection, { type: "settingsRequest" })).toEqual({
      type: "settings",
      settings: { roundCount: 20, turnSeconds: 20, handSize: 5 },
      updatedAt: null,
      updatedBy: null,
    });

    const newSettings = { roundCount: 12, turnSeconds: 30, handSize: 6 };
    expect(send(testLobby, adminConnection, settingsSave(newSettings))).toEqual({
      type: "settings",
      settings: newSettings,
      updatedAt: 1234,
      updatedBy: "theadmin",
    });

    expect(send(testLobby, adminConnection, { type: "deckRequest" })).toMatchObject({
      type: "adminError",
      code: "FORBIDDEN",
    });
    expect(send(testLobby, adminConnection, deckSave(ONLY_ADD_THREE))).toMatchObject({
      type: "adminError",
      code: "FORBIDDEN",
    });
    expect(testLobby.gameConfig.getDeck().entries).toEqual(expect.arrayContaining([...STARTING_DECK]));
    expect(testLobby.gameConfig.getDeck().updatedBy).toBeNull();
  });

  test("the Creator saves both settings and the deck", () => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "thecreator", "creator");
    testLobby.time.advance(5000);

    const newSettings = { roundCount: 8, turnSeconds: 15, handSize: 3 };
    expect(send(testLobby, creatorConnection, settingsSave(newSettings))).toMatchObject({
      type: "settings",
      settings: newSettings,
      updatedBy: "thecreator",
    });

    const reply = send(testLobby, creatorConnection, deckSave([
      { cardId: "mul3x1", copies: 4 },
      { cardId: "add1x1", copies: 9 },
    ]));
    expect(reply?.type).toBe("deck");
    if (reply?.type !== "deck") return;
    expect(reply.total).toBe(13);
    expect(reply.updatedAt).toBe(5000);
    expect(reply.updatedBy).toBe("thecreator");
    const copiesByCardId = Object.fromEntries(reply.cards.map((card) => [card.id, card.copies]));
    expect(copiesByCardId).toEqual({
      add1x1: 9, add1x2: 0, add3x1: 0, mul2x1: 0, mul2x2: 0, mul3x1: 4, addAll1: 0, servings2x2: 0,
    });
  });

  test("the permission follows the account's current role, not the role at login", () => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "demoted", "creator");
    const playerConnection = account(testLobby, "promoted", "player");

    testLobby.accounts.setRole(testLobby.accounts.findByUsername("demoted")!.id, "player");
    testLobby.accounts.setRole(testLobby.accounts.findByUsername("promoted")!.id, "admin");

    expect(send(testLobby, creatorConnection, { type: "deckRequest" })).toMatchObject({ code: "FORBIDDEN" });
    expect(send(testLobby, playerConnection, { type: "settingsRequest" })?.type).toBe("settings");
  });
});

describe("the deck reply", () => {
  test("lists every catalog card in catalog order with its copies and the total", () => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "thecreator", "creator");
    const reply = send(testLobby, creatorConnection, { type: "deckRequest" });
    expect(reply).toEqual({
      type: "deck",
      cards: CARD_CATALOG.map((card) => ({
        ...card,
        copies: STARTING_DECK.find((entry) => entry.cardId === card.id)?.copies ?? 0,
      })),
      total: 40,
      updatedAt: null,
      updatedBy: null,
    });
  });

  test("ignores a stored row for a card that is not in the catalog", () => {
    const testLobby = makeLobby({ seededDeck: [...STARTING_DECK, { cardId: "retiredCard", copies: 30 }] });
    const creatorConnection = account(testLobby, "thecreator", "creator");
    const reply = send(testLobby, creatorConnection, { type: "deckRequest" });
    if (reply?.type !== "deck") throw new Error(`expected deck, got ${reply?.type}`);
    expect(reply.cards.map((card) => card.id)).toEqual(CATALOG_CARD_IDS);
    expect(reply.total).toBe(40);
  });
});

describe("validation", () => {
  test.each<[string, GameSettings]>([
    ["round count too high", { roundCount: 31, turnSeconds: 20, handSize: 5 }],
    ["round count zero", { roundCount: 0, turnSeconds: 20, handSize: 5 }],
    ["turn clock too short", { roundCount: 20, turnSeconds: 4, handSize: 5 }],
    ["turn clock not whole", { roundCount: 20, turnSeconds: 10.5, handSize: 5 }],
    ["hand size too big", { roundCount: 20, turnSeconds: 20, handSize: 9 }],
  ])("out-of-range settings are refused and nothing changes: %s", (_label, badSettings) => {
    const testLobby = makeLobby();
    const adminConnection = account(testLobby, "theadmin", "admin");
    const before = testLobby.gameConfig.getSettings();
    expect(send(testLobby, adminConnection, settingsSave(badSettings))).toEqual({
      type: "adminError",
      code: "INVALID_SETTINGS",
      message: settingsProblem(badSettings),
    });
    expect(testLobby.gameConfig.getSettings()).toEqual(before);
  });

  test.each<[string, DeckEntry[]]>([
    ["unknown card", [{ cardId: "add1x1", copies: 20 }, { cardId: "nope", copies: 1 }]],
    ["duplicate card", [{ cardId: "add1x1", copies: 10 }, { cardId: "add1x1", copies: 10 }]],
    ["too many copies", [{ cardId: "add1x1", copies: 41 }]],
    ["total too small", [{ cardId: "add1x1", copies: 9 }]],
    ["total too large", [
      { cardId: "add1x1", copies: 40 }, { cardId: "add1x2", copies: 40 }, { cardId: "add3x1", copies: 21 },
    ]],
  ])("an invalid deck is refused and nothing changes: %s", (_label, badDeck) => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "thecreator", "creator");
    const before = testLobby.gameConfig.getDeck();
    expect(send(testLobby, creatorConnection, deckSave(badDeck))).toEqual({
      type: "adminError",
      code: "INVALID_DECK",
      message: deckProblem(badDeck, CATALOG_CARD_IDS),
    });
    expect(testLobby.gameConfig.getDeck()).toEqual(before);
  });
});

describe("saving while busy", () => {
  test("an Admin can save while waiting in the queue", () => {
    const testLobby = makeLobby();
    const adminConnection = account(testLobby, "theadmin", "admin");
    testLobby.lobby.handleMessage(adminConnection.socket, { type: "queueJoin" });
    const reply = send(testLobby, adminConnection, settingsSave({ roundCount: 9, turnSeconds: 9, handSize: 4 }));
    expect(reply?.type).toBe("settings");
  });

  test("the Creator can save while seated in a game", () => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "thecreator", "creator");
    const opponent = guest(testLobby, "Sam");
    testLobby.lobby.handleMessage(creatorConnection.socket, { type: "queueJoin" });
    testLobby.lobby.handleMessage(opponent.socket, { type: "queueJoin" });
    expect(lastRoomState(creatorConnection.out).phase).toBe("in-progress");

    expect(send(testLobby, creatorConnection, settingsSave({ roundCount: 9, turnSeconds: 9, handSize: 4 }))?.type)
      .toBe("settings");
    expect(send(testLobby, creatorConnection, deckSave(ONLY_ADD_THREE))?.type).toBe("deck");
  });
});

describe("rules for each room", () => {
  test("a save changes the next room's round count, turn clock, hand size, and deck", () => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "thecreator", "creator");
    send(testLobby, creatorConnection, settingsSave({ roundCount: 3, turnSeconds: 7, handSize: 4 }));
    send(testLobby, creatorConnection, deckSave(ONLY_ADD_THREE));

    const [firstPlayer] = startRoom(testLobby);
    const roomState = lastRoomState(firstPlayer.out);
    expect(roomState.roundCount).toBe(3);
    expect(roomState.deadlineAt).toBe(testLobby.time.clock.now() + 7000);
    expect(roomState.you.hand).toHaveLength(4);
    expect(roomState.you.hand.every((card) => card.id === "add3x1")).toBe(true);
  });

  test("a running room keeps its own values, even when its deck is rebuilt mid-game", () => {
    const testLobby = makeLobby();
    const creatorConnection = account(testLobby, "thecreator", "creator");
    send(testLobby, creatorConnection, settingsSave({ roundCount: 20, turnSeconds: 5, handSize: 3 }));
    send(testLobby, creatorConnection, deckSave([{ cardId: "add1x1", copies: 10 }]));

    const [firstPlayer] = startRoom(testLobby);
    send(testLobby, creatorConnection, settingsSave({ roundCount: 30, turnSeconds: 60, handSize: 8 }));
    send(testLobby, creatorConnection, deckSave([{ cardId: "mul3x1", copies: 10 }]));

    // Hand 3 from a 10-card deck leaves 7 to draw; round 8 draws from a rebuilt deck.
    for (let roundIndex = 0; roundIndex < 12; roundIndex++) testLobby.time.advance(5000);

    const roomState = lastRoomState(firstPlayer.out);
    expect(roomState.roundIndex).toBe(12);
    expect(roomState.roundCount).toBe(20);
    expect(roomState.deadlineAt).toBe(testLobby.time.clock.now() + 5000);
    expect(roomState.you.hand).toHaveLength(3);
    expect(roomState.you.hand.every((card) => card.id === "add1x1")).toBe(true);
    // The first two decks stamp instance ids 0-19, so a higher id came from a rebuild.
    expect(roomState.you.hand.some((card) => Number(card.instanceId) >= 20)).toBe(true);
  });

  test("a stored deck below the minimum is replaced by the starting deck for that room, with a warning", () => {
    const testLobby = makeLobby({ seededDeck: [{ cardId: "retiredCard", copies: 40 }] });
    const [firstPlayer] = startRoom(testLobby);
    const roomState = lastRoomState(firstPlayer.out);
    expect(roomState.phase).toBe("in-progress");
    expect(roomState.you.hand).toHaveLength(5);
    expect(testLobby.warnings.length).toBeGreaterThan(0);
  });
});
