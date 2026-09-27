import { describe, expect, test } from "vitest";
import {
  AppearanceSchema,
  PROTOCOL_VERSION,
  SHOP_ITEMS,
  type Appearance,
  type ClientMessage,
  type Role,
  type ServerMessage,
  type ShopConfigEntry,
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
import { ShopStore } from "../src/shop/shopStore.js";
import { STARTING_DECK } from "../src/engine/rules/content.js";

const ROUND_COUNT = 2;
const MOVE_DEADLINE_MS = 20000;
const PASSWORD = "correct-horse";

// Parsed, as the wire would deliver it: the face fields take their defaults.
const FREE_LOOK: Appearance = AppearanceSchema.parse({
  skinTone: "#f6d7bf",
  hairStyle: "short",
  hairColor: "#2b2220",
  shirtColor: "#d94f3d",
  pantsColor: "#3f5a7a",
  accessory: "glasses",
});
const CROWN_LOOK: Appearance = { ...FREE_LOOK, accessory: "crown" };
const HEART_EYES_LOOK: Appearance = { ...FREE_LOOK, eyeShape: "heart" };

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
  const shop = new ShopStore(database, time.clock);
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
    shop,
  });
  return { lobby, time, database, accounts, shop };
}
type TestLobby = ReturnType<typeof makeLobby>;

function connection() {
  const out: ServerMessage[] = [];
  const socket: Connection = { send: (message) => out.push(message), session: null };
  return { socket, out };
}
type TestConnection = ReturnType<typeof connection>;

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
  testLobby.lobby.handleMessage(guestConnection.socket, { type: "hello", protocolVersion: PROTOCOL_VERSION, name });
  return guestConnection;
}

/** A logged-in session whose account holds `role` and `lunchMoney`. */
function account(testLobby: TestLobby, username: string, options: { role?: Role; lunchMoney?: number } = {}) {
  const accountConnection = guest(testLobby, `guest-${username}`);
  testLobby.lobby.handleMessage(accountConnection.socket, { type: "accountRegister", username, password: PASSWORD });
  const record = testLobby.accounts.findByUsername(username);
  if (!record) throw new Error(`no account ${username}`);
  testLobby.accounts.setRole(record.id, options.role ?? "player");
  testLobby.database
    .prepare("UPDATE accounts SET lunch_money = ? WHERE id = ?")
    .run(options.lunchMoney ?? 0, record.id);
  return { ...accountConnection, accountId: record.id };
}

/** Every message the lobby sent `sender` in answer to `message`. */
function send(testLobby: TestLobby, sender: TestConnection, message: ClientMessage): ServerMessage[] {
  const sentBefore = sender.out.length;
  testLobby.lobby.handleMessage(sender.socket, message);
  return sender.out.slice(sentBefore);
}

function shopConfigSave(items: ShopConfigEntry[]): ClientMessage {
  return { type: "shopConfigSave", items };
}

function queueTogether(testLobby: TestLobby, first: TestConnection, second: TestConnection): void {
  testLobby.lobby.handleMessage(first.socket, { type: "queueJoin" });
  testLobby.lobby.handleMessage(second.socket, { type: "queueJoin" });
}

describe("guests", () => {
  test("a guest is refused the shop and buying with NOT_LOGGED_IN", () => {
    const testLobby = makeLobby();
    const riley = guest(testLobby, "Riley");
    for (const message of [{ type: "shopRequest" }, { type: "shopBuy", itemId: "extra.crown" }] as ClientMessage[]) {
      expect(send(testLobby, riley, message)).toEqual([
        { type: "accountError", code: "NOT_LOGGED_IN", message: "You are not logged in." },
      ]);
    }
  });

  test("a guest's look with any shop value is refused with NOT_OWNED, and a free look is accepted", () => {
    const testLobby = makeLobby();
    const riley = guest(testLobby, "Riley");
    expect(send(testLobby, riley, { type: "appearanceSet", appearance: FREE_LOOK })).toEqual([]);
    expect(riley.socket.session?.appearance).toEqual(FREE_LOOK);

    for (const item of SHOP_ITEMS) {
      const shopLook = { ...FREE_LOOK, [item.unlocks.field]: item.unlocks.value } as Appearance;
      const replies = send(testLobby, riley, { type: "appearanceSet", appearance: shopLook });
      expect(replies).toMatchObject([{ type: "accountError", code: "NOT_OWNED" }]);
    }
    expect(riley.socket.session?.appearance).toEqual(FREE_LOOK);
  });
});

describe("the shop", () => {
  test("shopRequest lists the available items at their prices, marks owned ones, and gives the balance", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 140 });
    testLobby.accounts.buyItem(riley.accountId, "extra.bowTie", 30);

    const [shopMessage] = send(testLobby, riley, { type: "shopRequest" });

    expect(shopMessage?.type).toBe("shop");
    if (shopMessage?.type !== "shop") return;
    expect(shopMessage.balance).toBe(110);
    expect(shopMessage.items.map((item) => item.id)).toEqual(SHOP_ITEMS.map((item) => item.id));
    expect(shopMessage.items.find((item) => item.id === "extra.crown")).toEqual({
      id: "extra.crown",
      name: "Crown",
      kind: "extra",
      price: 100,
      available: true,
      owned: false,
    });
    expect(shopMessage.items.find((item) => item.id === "extra.bowTie")?.owned).toBe(true);
  });

  test("a buy answers shop and then the updated profile", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 140 });

    const replies = send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });

    expect(replies.map((reply) => reply.type)).toEqual(["shop", "profile"]);
    const [shopMessage, profileMessage] = replies;
    if (shopMessage?.type !== "shop" || profileMessage?.type !== "profile") return;
    expect(shopMessage.balance).toBe(40);
    expect(shopMessage.items.find((item) => item.id === "extra.crown")?.owned).toBe(true);
    expect(profileMessage.profile.lunchMoney).toBe(40);
    expect(profileMessage.profile.ownedItems).toEqual(["extra.crown"]);
  });

  test("a buy charges the Creator's saved price, not the default", () => {
    const testLobby = makeLobby();
    const creator = account(testLobby, "TheCreator", { role: "creator" });
    send(testLobby, creator, shopConfigSave([{ itemId: "extra.crown", price: 7, available: true }]));
    const riley = account(testLobby, "Riley_1", { lunchMoney: 10 });

    send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });

    expect(testLobby.accounts.get(riley.accountId)?.lunchMoney).toBe(3);
  });

  test("a buy of an unknown item or a turned-off one is NOT_AVAILABLE and charges nothing", () => {
    const testLobby = makeLobby();
    const creator = account(testLobby, "TheCreator", { role: "creator" });
    send(testLobby, creator, shopConfigSave([{ itemId: "extra.crown", price: 100, available: false }]));
    const riley = account(testLobby, "Riley_1", { lunchMoney: 500 });

    for (const itemId of ["extra.crown", "extra.jetpack"]) {
      expect(send(testLobby, riley, { type: "shopBuy", itemId })).toMatchObject([
        { type: "accountError", code: "NOT_AVAILABLE" },
      ]);
    }
    expect(testLobby.accounts.get(riley.accountId)?.lunchMoney).toBe(500);
    expect(testLobby.accounts.get(riley.accountId)?.ownedItems).toEqual([]);
  });

  test("a buy that costs more than the balance is NOT_ENOUGH", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 99 });
    expect(send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" })).toMatchObject([
      { type: "accountError", code: "NOT_ENOUGH" },
    ]);
    expect(testLobby.accounts.get(riley.accountId)?.lunchMoney).toBe(99);
  });

  test("two quick buys of different items cannot overspend the balance", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 50 });

    const firstReplies = send(testLobby, riley, { type: "shopBuy", itemId: "extra.sunglasses" });
    const secondReplies = send(testLobby, riley, { type: "shopBuy", itemId: "extra.bowTie" });

    expect(firstReplies.map((reply) => reply.type)).toEqual(["shop", "profile"]);
    expect(secondReplies).toMatchObject([{ type: "accountError", code: "NOT_ENOUGH" }]);
    expect(testLobby.accounts.get(riley.accountId)?.lunchMoney).toBe(20);
    expect(testLobby.accounts.get(riley.accountId)?.ownedItems).toEqual(["extra.sunglasses"]);
  });

  test("buying the same item twice charges once and answers ALREADY_OWNED", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 500 });

    send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });
    const secondReplies = send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });

    expect(secondReplies).toMatchObject([{ type: "accountError", code: "ALREADY_OWNED" }]);
    expect(testLobby.accounts.get(riley.accountId)?.lunchMoney).toBe(400);
  });

  test("turning an item off hides it from the shop, but its owner keeps it and can still wear it", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 500 });
    send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });
    const creator = account(testLobby, "TheCreator", { role: "creator" });
    send(testLobby, creator, shopConfigSave([{ itemId: "extra.crown", price: 100, available: false }]));

    const [shopMessage] = send(testLobby, riley, { type: "shopRequest" });
    if (shopMessage?.type !== "shop") throw new Error("expected shop");
    expect(shopMessage.items.map((item) => item.id)).not.toContain("extra.crown");
    expect(shopMessage.items).toHaveLength(SHOP_ITEMS.length - 1);

    const [profileMessage] = send(testLobby, riley, { type: "profileRequest" });
    if (profileMessage?.type !== "profile") throw new Error("expected profile");
    expect(profileMessage.profile.ownedItems).toEqual(["extra.crown"]);
    expect(send(testLobby, riley, { type: "appearanceSet", appearance: CROWN_LOOK })).toEqual([]);
    expect(testLobby.accounts.get(riley.accountId)?.appearance).toEqual(CROWN_LOOK);
  });
});

describe("the Creator's shop config", () => {
  const SHOP_CONFIG_MESSAGES: ClientMessage[] = [
    { type: "shopConfigRequest" },
    shopConfigSave([{ itemId: "extra.crown", price: 5, available: true }]),
  ];

  test("a guest, a Player, and an Admin are refused with FORBIDDEN and nothing is saved", () => {
    const testLobby = makeLobby();
    const senders = [
      guest(testLobby, "Riley"),
      account(testLobby, "plainplayer", { role: "player" }),
      account(testLobby, "anadmin", { role: "admin" }),
    ];
    for (const sender of senders) {
      for (const message of SHOP_CONFIG_MESSAGES) {
        expect(send(testLobby, sender, message)).toMatchObject([{ type: "adminError", code: "FORBIDDEN" }]);
      }
    }
    expect(testLobby.shop.getConfig().updatedBy).toBeNull();
    expect(testLobby.shop.itemConfig("extra.crown")?.price).toBe(100);
  });

  test("the Creator gets every item, including turned-off ones", () => {
    const testLobby = makeLobby();
    const creator = account(testLobby, "TheCreator", { role: "creator" });
    send(testLobby, creator, shopConfigSave([{ itemId: "shirt.gold", price: 100, available: false }]));

    const [configMessage] = send(testLobby, creator, { type: "shopConfigRequest" });

    if (configMessage?.type !== "shopConfig") throw new Error("expected shopConfig");
    expect(configMessage.items.map((item) => item.id)).toEqual(SHOP_ITEMS.map((item) => item.id));
    expect(configMessage.items.find((item) => item.id === "shirt.gold")?.available).toBe(false);
    expect(configMessage.updatedBy).toBe("TheCreator");
  });

  test("the Creator's save is answered with shopConfig and records who and when", () => {
    const testLobby = makeLobby();
    const creator = account(testLobby, "TheCreator", { role: "creator" });
    testLobby.time.advance(2500);

    const replies = send(
      testLobby,
      creator,
      shopConfigSave([{ itemId: "extra.crown", price: 250, available: false }]),
    );

    expect(replies).toHaveLength(1);
    const [configMessage] = replies;
    if (configMessage?.type !== "shopConfig") throw new Error("expected shopConfig");
    expect(configMessage.items.find((item) => item.id === "extra.crown")).toMatchObject({
      price: 250,
      available: false,
    });
    expect(configMessage.updatedAt).toBe(2500);
    expect(configMessage.updatedBy).toBe("TheCreator");
  });

  test.each([
    ["a price of 0", [{ itemId: "extra.crown", price: 0, available: true }]],
    ["a price of 1001", [{ itemId: "extra.crown", price: 1001, available: true }]],
    ["a fractional price", [{ itemId: "extra.crown", price: 2.5, available: true }]],
    ["an unknown item id", [{ itemId: "extra.jetpack", price: 50, available: true }]],
    [
      "an item listed twice",
      [
        { itemId: "extra.crown", price: 50, available: true },
        { itemId: "extra.crown", price: 60, available: true },
      ],
    ],
  ])("%s is refused with INVALID_SHOP and nothing is saved", (_description, items) => {
    const testLobby = makeLobby();
    const creator = account(testLobby, "TheCreator", { role: "creator" });

    expect(send(testLobby, creator, shopConfigSave(items))).toMatchObject([
      { type: "adminError", code: "INVALID_SHOP" },
    ]);
    expect(testLobby.shop.getConfig().updatedBy).toBeNull();
    expect(testLobby.shop.itemConfig("extra.crown")?.price).toBe(100);
  });

  test("a Creator demoted mid-session is refused on the next save", () => {
    const testLobby = makeLobby();
    const creator = account(testLobby, "TheCreator", { role: "creator" });
    testLobby.accounts.setRole(creator.accountId, "admin");
    expect(
      send(testLobby, creator, shopConfigSave([{ itemId: "extra.crown", price: 5, available: true }])),
    ).toMatchObject([{ type: "adminError", code: "FORBIDDEN" }]);
  });
});

describe("ownership of looks", () => {
  test("a logged-in look with an unowned item is refused with NOT_OWNED and not saved", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 500 });
    send(testLobby, riley, { type: "appearanceSet", appearance: FREE_LOOK });

    expect(send(testLobby, riley, { type: "appearanceSet", appearance: HEART_EYES_LOOK })).toMatchObject([
      { type: "accountError", code: "NOT_OWNED" },
    ]);
    expect(riley.socket.session?.appearance).toEqual(FREE_LOOK);
    expect(testLobby.accounts.get(riley.accountId)?.appearance).toEqual(FREE_LOOK);
  });

  test("a look with an owned item is accepted, saved, and worn in the room", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 500 });
    send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });

    expect(send(testLobby, riley, { type: "appearanceSet", appearance: CROWN_LOOK })).toEqual([]);
    expect(testLobby.accounts.get(riley.accountId)?.appearance).toEqual(CROWN_LOOK);

    const sam = guest(testLobby, "Sam");
    queueTogether(testLobby, riley, sam);
    expect(lastOf(sam.out, "roomState")?.opponent.appearance).toEqual(CROWN_LOOK);
  });

  test("after logging out, a look with shop items is not worn into a room as a guest", () => {
    const testLobby = makeLobby();
    const riley = account(testLobby, "Riley_1", { lunchMoney: 500 });
    send(testLobby, riley, { type: "shopBuy", itemId: "extra.crown" });
    send(testLobby, riley, { type: "appearanceSet", appearance: CROWN_LOOK });
    send(testLobby, riley, { type: "accountLogout" });
    expect(riley.socket.session?.appearance).toEqual({ ...CROWN_LOOK, accessory: "none" });

    const sam = guest(testLobby, "Sam");
    queueTogether(testLobby, riley, sam);

    const opponentLook = lastOf(sam.out, "roomState")?.opponent.appearance;
    expect(opponentLook).toEqual({ ...CROWN_LOOK, accessory: "none" });
  });

  test("a room captures only allowed looks, even if an unowned item reached the session", () => {
    const testLobby = makeLobby();
    const riley = guest(testLobby, "Riley");
    riley.socket.session!.appearance = { ...HEART_EYES_LOOK, accessory: "crown" };

    const sam = guest(testLobby, "Sam");
    queueTogether(testLobby, riley, sam);

    expect(lastOf(sam.out, "roomState")?.opponent.appearance).toEqual({ ...FREE_LOOK, accessory: "none" });
  });
});

test("a finished game adds the score to Lunch Money", () => {
  const testLobby = makeLobby();
  const riley = account(testLobby, "Riley_1", { lunchMoney: 25 });
  const sam = guest(testLobby, "Sam");
  queueTogether(testLobby, riley, sam);
  for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex++) testLobby.time.advance(MOVE_DEADLINE_MS);

  const gameOver = lastOf(riley.out, "gameOver");
  const profile = lastOf(riley.out, "profile")?.profile;
  if (!gameOver || !profile) throw new Error("expected gameOver and profile");
  const rileySeat = lastOf(riley.out, "roomState")!.you.seat;
  const rileyScore = gameOver.result.scores[rileySeat]!;
  expect(rileyScore).toBeGreaterThan(0);
  expect(profile.lunchMoney).toBe(25 + rileyScore);
});
