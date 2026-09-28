import {
  DECK_LIMITS,
  PROTOCOL_VERSION,
  SHOP_ITEMS,
  deckProblem,
  lockedItemsIn,
  permissionsFor,
  settingsProblem,
  shopConfigProblem,
  type AccountErrorCode,
  type AdminErrorCode,
  type Appearance,
  type ClientMessage,
  type DeckEntry,
  type GameSettings,
  type Permission,
  type ServerMessage,
  type ShopConfigEntry,
  type ShopItemView,
} from "@eat.io/protocol";
import type { AccountRecord, AccountStore } from "../accounts/accountStore.js";
import type { GameConfigStore } from "../gameConfig/gameConfigStore.js";
import type { ShopItemConfig, ShopStore } from "../shop/shopStore.js";
import { withoutLockedItems } from "../shop/looks.js";
import type { PlayerId } from "../engine/state.js";
import { makeRules } from "../engine/rules/index.js";
import { CARD_CATALOG, STARTING_DECK, TUNING } from "../engine/rules/content.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { Clock, Timers } from "./timers.js";
import { Session, type SendFn } from "../session/session.js";
import { Matchmaker } from "./matchmaking.js";
import { RoomRegistry } from "./registry.js";
import { Room, type SeatResult } from "./room.js";
import { BOT_MOVE_DELAY_MS, PRACTICE_BOT_LOOK, PRACTICE_BOT_NAME, PracticeBot } from "./practiceBot.js";

export interface Connection {
  send: SendFn;
  session: Session | null;
}

export interface LobbyDeps {
  config: Config;
  clock: Clock;
  timers: Timers;
  registry: RoomRegistry;
  matchmaker: Matchmaker;
  logger: Logger;
  genId: () => string;
  genToken: () => string;
  accounts: AccountStore;
  /** Game settings and the default deck. Each room reads them once, when it starts. */
  gameConfig: GameConfigStore;
  /** The Creator's shop prices and availability. */
  shop: ShopStore;
}

const ACCOUNT_ERROR_MESSAGES: Record<AccountErrorCode, string> = {
  INVALID_USERNAME: "Usernames are 3 to 14 letters, digits, _ or -.",
  INVALID_PASSWORD: "Passwords are 8 to 128 characters.",
  USERNAME_TAKEN: "That username is taken.",
  BAD_CREDENTIALS: "Wrong username or password.",
  WRONG_PASSWORD: "Your current password is wrong.",
  RATE_LIMITED: "Too many tries. Wait a minute and try again.",
  NOT_LOGGED_IN: "You are not logged in.",
  BUSY: "Leave the queue or the game first.",
  NOT_OWNED: "That look uses a shop item you do not own.",
  NOT_AVAILABLE: "That item is not in the shop.",
  ALREADY_OWNED: "You already own that item.",
  NOT_ENOUGH: "You do not have enough Lunch Money for that.",
};

/** BUSY also covers a register or login from a session that already has an account. */
const LOG_OUT_FIRST_MESSAGE = "Log out first.";

const FORBIDDEN_MESSAGE = "You do not have permission to do that.";

const ALREADY_BUSY_MESSAGE = "Leave your game or the queue first.";

// A practice game's rules are fixed, so the tutorial is the same whatever the saved
// settings and deck are.
const PRACTICE_ROUND_COUNT = 6;
const PRACTICE_HAND_SIZE = 5;
/** The human's first hand, in hand order: the cards the tutorial walks through. */
const PRACTICE_OPENING_HAND: readonly string[] = ["add3x1", "mul2x1", "addAll1", "servings2x2", "add1x2"];
/** Mixed into the room's seed for the bot's, so its choices do not follow the deal. */
const PRACTICE_BOT_SEED_SALT = 0x5eed_b07;

const CATALOG_CARD_IDS: readonly string[] = CARD_CATALOG.map((card) => card.id);
const SHOP_ITEM_IDS: readonly string[] = SHOP_ITEMS.map((item) => item.id);

export class Lobby {
  private sessions = new Map<string, Session>();
  private byToken = new Map<string, Session>();
  private playerRoom = new Map<PlayerId, string>();
  /** The account each seat of a live room played as, fixed when the room starts. */
  private roomAccounts = new Map<string, Map<PlayerId, number>>();

  constructor(private readonly deps: LobbyDeps) {}

  handleMessage(conn: Connection, msg: ClientMessage): void {
    if (msg.type === "hello") {
      this.handleHello(conn, msg);
      return;
    }
    const session = conn.session;
    if (!session) {
      conn.send({ type: "error", code: "NO_SESSION", message: "Send hello before anything else." });
      return;
    }
    const playerId = session.id;
    switch (msg.type) {
      case "ping":
        session.send({ type: "pong" });
        break;
      case "queueJoin": {
        const result = this.deps.matchmaker.joinPublic(playerId, this.canPairWith(playerId));
        if (result.paired) this.startRoom(result.opponent, playerId);
        else this.sendTo(playerId, { type: "queueWaiting" });
        break;
      }
      case "queueCancel":
        // Covers both ways of waiting: the public queue and an unclaimed private room.
        this.deps.matchmaker.remove(playerId);
        session.send({ type: "queueCancelled" });
        break;
      case "roomCreatePrivate":
        session.send({ type: "roomJoinedPrivate", code: this.deps.matchmaker.createPrivate(playerId) });
        break;
      case "roomJoinPrivate": {
        const result = this.deps.matchmaker.joinPrivate(playerId, msg.code, this.canPairWith(playerId));
        if (result.ok) this.startRoom(result.host, playerId);
        else this.sendTo(playerId, { type: "error", code: "NO_SUCH_ROOM", message: result.reason });
        break;
      }
      case "submitTurn": {
        const room = this.roomOf(playerId);
        if (!room) {
          this.sendTo(playerId, { type: "actionRejected", code: "NOT_IN_ROOM", message: "You are not in a game." });
          break;
        }
        room.submit(playerId, {
          cardInstanceId: msg.cardInstanceId,
          targetTrayIds: msg.targetTrayIds,
        });
        break;
      }
      case "practiceStart":
        if (this.isBusy(playerId)) {
          session.send({ type: "error", code: "ALREADY_BUSY", message: ALREADY_BUSY_MESSAGE });
          break;
        }
        this.startPracticeRoom(session);
        break;
      case "roomLeave": {
        this.deps.matchmaker.remove(playerId);
        this.roomOf(playerId)?.leave(playerId);
        session.send({ type: "roomLeft" });
        break;
      }
      case "accountRegister":
        this.handleRegister(session, msg.username, msg.password);
        break;
      case "accountLogin":
        this.handleLogin(session, msg.username, msg.password);
        break;
      case "accountLogout":
        this.handleLogout(session);
        break;
      case "accountChangePassword":
        this.handleChangePassword(session, msg.currentPassword, msg.newPassword);
        break;
      case "appearanceSet":
        this.handleAppearanceSet(session, msg.appearance);
        break;
      case "profileRequest": {
        const account = this.loggedInAccount(session);
        if (account) session.send({ type: "profile", profile: this.deps.accounts.profileOf(account) });
        break;
      }
      // Settings and deck changes affect only rooms that start later, so they are
      // allowed while the sender is queued or seated.
      case "settingsRequest":
        if (!this.accountWithPermission(session, "settings.edit")) break;
        session.send(this.settingsMessage());
        break;
      case "settingsSave":
        this.handleSettingsSave(session, {
          roundCount: msg.roundCount,
          turnSeconds: msg.turnSeconds,
          handSize: msg.handSize,
        });
        break;
      case "deckRequest":
        if (!this.accountWithPermission(session, "deck.edit")) break;
        session.send(this.deckMessage());
        break;
      case "deckSave":
        this.handleDeckSave(session, msg.cards);
        break;
      case "shopRequest": {
        const account = this.loggedInAccount(session);
        if (account) session.send(this.shopMessage(account));
        break;
      }
      case "shopBuy":
        this.handleShopBuy(session, msg.itemId);
        break;
      case "shopConfigRequest": {
        const account = this.accountWithPermission(session, "shop.edit");
        if (account) session.send(this.shopConfigMessage(account));
        break;
      }
      case "shopConfigSave":
        this.handleShopConfigSave(session, msg.items);
        break;
      default: {
        const never: never = msg;
        void never;
      }
    }
  }

  /** Called by the transport before sockets are torn down (§1.7). */
  shutdown(): void {
    for (const room of this.deps.registry.list()) room.shutdown();
  }

  handleClose(conn: Connection): void {
    const session = conn.session;
    if (!session) return;
    session.detach();
    this.deps.matchmaker.remove(session.id);
    const room = this.roomOf(session.id);
    if (room) room.markDisconnected(session.id);
    else this.dropSession(session);
  }

  private handleHello(conn: Connection, msg: Extract<ClientMessage, { type: "hello" }>): void {
    // One session per connection. A fresh session would bring a fresh login guard,
    // so a second hello could reset the brute-force limit (spec §5).
    if (conn.session) {
      conn.send({ type: "error", code: "ALREADY_GREETED", message: "This connection already has a session." });
      return;
    }
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      conn.send({ type: "error", code: "PROTOCOL_MISMATCH", message: `Server speaks protocol ${PROTOCOL_VERSION}.` });
      return;
    }
    if (msg.sessionToken) {
      const existing = this.byToken.get(msg.sessionToken);
      if (existing) {
        existing.attach(conn.send);
        conn.session = existing;
        existing.send({ type: "welcome", playerId: existing.id, sessionToken: existing.token });
        this.roomOf(existing.id)?.markReconnected(existing.id);
        this.deps.logger.info("session reconnected", { playerId: existing.id });
        return;
      }
      // Unknown/expired token — fall through and mint a fresh session.
    }
    const id = this.deps.genId();
    const token = this.deps.genToken();
    const session = new Session({ id, name: msg.name, token, send: conn.send, clock: this.deps.clock });
    this.sessions.set(id, session);
    this.byToken.set(token, session);
    conn.session = session;
    session.send({ type: "welcome", playerId: id, sessionToken: token });
    this.deps.logger.info("session created", { playerId: id });
    if (msg.loginToken !== undefined) this.resumeLogin(session, msg.loginToken);
  }

  /** `hello` carried a login token for a brand-new session: log it back in, or say it expired. */
  private resumeLogin(session: Session, loginToken: string): void {
    const account = this.deps.accounts.resumeLoginToken(loginToken);
    if (!account) {
      session.send({ type: "accountLoggedOut", reason: "expired" });
      return;
    }
    const loggedInAccount = this.deps.accounts.recordLogin(account.id);
    this.attachAccount(session, loggedInAccount, loginToken);
    session.send({ type: "accountLoggedIn", profile: this.deps.accounts.profileOf(loggedInAccount) });
  }

  private handleRegister(session: Session, username: string, password: string): void {
    if (this.refuseWhileBusy(session) || this.refuseWhileLoggedIn(session) || this.refuseWhileRateLimited(session)) {
      return;
    }
    const registration = this.deps.accounts.register(username, password);
    if (!registration.ok) {
      this.sendAccountError(session, registration.code);
      return;
    }
    this.completeLogin(session, registration.account);
  }

  private handleLogin(session: Session, username: string, password: string): void {
    if (this.refuseWhileBusy(session) || this.refuseWhileLoggedIn(session) || this.refuseWhileRateLimited(session)) {
      return;
    }
    const account = this.deps.accounts.verifyLogin(username, password);
    if (!account) {
      session.loginGuard.recordFailure();
      this.sendAccountError(session, "BAD_CREDENTIALS");
      return;
    }
    this.completeLogin(session, account);
  }

  /** A register or a password login succeeded: record it, issue a login token, and attach. */
  private completeLogin(session: Session, account: AccountRecord): void {
    if (account.appearance === null && session.appearance !== null) {
      this.deps.accounts.saveAppearance(account.id, session.appearance);
    }
    const loggedInAccount = this.deps.accounts.recordLogin(account.id);
    const loginToken = this.deps.accounts.createLoginToken(account.id);
    this.attachAccount(session, loggedInAccount, loginToken);
    session.send({
      type: "accountLoggedIn",
      profile: this.deps.accounts.profileOf(loggedInAccount),
      loginToken,
    });
    this.deps.logger.info("account logged in", { playerId: session.id, accountId: account.id });
  }

  private handleLogout(session: Session): void {
    if (this.refuseWhileBusy(session)) return;
    if (session.accountId === null) {
      this.sendAccountError(session, "NOT_LOGGED_IN");
      return;
    }
    if (session.loginToken !== null) this.deps.accounts.deleteLoginToken(session.loginToken);
    this.deps.logger.info("account logged out", { playerId: session.id, accountId: session.accountId });
    session.accountId = null;
    session.loginToken = null;
    session.name = session.guestName;
    // A guest owns nothing, so the account's shop items come off with the account.
    if (session.appearance !== null) session.appearance = withoutLockedItems(session.appearance, []);
    session.send({ type: "accountLoggedOut", reason: "requested" });
  }

  private handleChangePassword(session: Session, currentPassword: string, newPassword: string): void {
    const accountId = session.accountId;
    if (accountId === null) {
      this.sendAccountError(session, "NOT_LOGGED_IN");
      return;
    }
    if (this.refuseWhileRateLimited(session)) return;
    const outcome = this.deps.accounts.changePassword(accountId, currentPassword, newPassword);
    if (outcome !== "ok") {
      if (outcome === "WRONG_PASSWORD") session.loginGuard.recordFailure();
      this.sendAccountError(session, outcome);
      return;
    }
    this.deps.accounts.deleteOtherLoginTokens(accountId, session.loginToken);
    session.send({ type: "passwordChanged" });
  }

  /**
   * Refuses a look that uses a shop item the player does not own, before it reaches the
   * session or the account. Ownership is read from the store now. A guest owns nothing.
   */
  private handleAppearanceSet(session: Session, appearance: Appearance): void {
    const account = session.accountId === null ? null : this.deps.accounts.get(session.accountId);
    if (lockedItemsIn(appearance, account?.ownedItems ?? []).length > 0) {
      this.sendAccountError(session, "NOT_OWNED");
      return;
    }
    session.appearance = appearance;
    if (account) this.deps.accounts.saveAppearance(account.id, appearance);
  }

  /** The buy itself is one store transaction that checks ownership and the balance. */
  private handleShopBuy(session: Session, itemId: string): void {
    const account = this.loggedInAccount(session);
    if (!account) return;
    const itemConfig = this.deps.shop.itemConfig(itemId);
    if (!itemConfig || !itemConfig.available) {
      this.sendAccountError(session, "NOT_AVAILABLE");
      return;
    }
    const purchase = this.deps.accounts.buyItem(account.id, itemId, itemConfig.price);
    if (!purchase.ok) {
      this.sendAccountError(session, purchase.code);
      return;
    }
    this.deps.logger.info("shop item bought", { accountId: account.id, itemId, price: itemConfig.price });
    session.send(this.shopMessage(purchase.account));
    session.send({ type: "profile", profile: this.deps.accounts.profileOf(purchase.account) });
  }

  private handleShopConfigSave(session: Session, entries: ShopConfigEntry[]): void {
    const account = this.accountWithPermission(session, "shop.edit");
    if (!account) return;
    const problem = shopConfigProblem(entries, SHOP_ITEM_IDS);
    if (problem !== null) {
      this.sendAdminError(session, "INVALID_SHOP", problem);
      return;
    }
    this.deps.shop.saveConfig(entries, account.id);
    this.deps.logger.info("shop config saved", { accountId: account.id });
    session.send(this.shopConfigMessage(account));
  }

  private handleSettingsSave(session: Session, settings: GameSettings): void {
    const account = this.accountWithPermission(session, "settings.edit");
    if (!account) return;
    const problem = settingsProblem(settings);
    if (problem !== null) {
      this.sendAdminError(session, "INVALID_SETTINGS", problem);
      return;
    }
    this.deps.gameConfig.saveSettings(settings, account.id);
    this.deps.logger.info("game settings saved", { accountId: account.id, ...settings });
    session.send(this.settingsMessage());
  }

  private handleDeckSave(session: Session, entries: DeckEntry[]): void {
    const account = this.accountWithPermission(session, "deck.edit");
    if (!account) return;
    const problem = deckProblem(entries, CATALOG_CARD_IDS);
    if (problem !== null) {
      this.sendAdminError(session, "INVALID_DECK", problem);
      return;
    }
    this.deps.gameConfig.saveDeck(entries, account.id);
    this.deps.logger.info("default deck saved", { accountId: account.id });
    session.send(this.deckMessage());
  }

  private settingsMessage(): ServerMessage {
    return { type: "settings", ...this.deps.gameConfig.getSettings() };
  }

  /** Every catalog card, in catalog order, with its copies in the stored deck (0 when absent). */
  private deckMessage(): ServerMessage {
    const { entries, updatedAt, updatedBy } = this.deps.gameConfig.getDeck();
    const copiesByCardId = new Map(entries.map((entry) => [entry.cardId, entry.copies]));
    const cards = CARD_CATALOG.map((card) => ({ ...card, copies: copiesByCardId.get(card.id) ?? 0 }));
    const total = cards.reduce((totalCopies, card) => totalCopies + card.copies, 0);
    return { type: "deck", cards, total, updatedAt, updatedBy };
  }

  /** The available items only: an item turned off leaves the shop, even for its owners. */
  private shopMessage(account: AccountRecord): ServerMessage {
    const items = this.deps.shop
      .getConfig()
      .items.filter((itemConfig) => itemConfig.available)
      .map((itemConfig) => shopItemView(itemConfig, account));
    return { type: "shop", items, balance: account.lunchMoney };
  }

  /** Every catalog item, including turned-off ones. */
  private shopConfigMessage(account: AccountRecord): ServerMessage {
    const { items, updatedAt, updatedBy } = this.deps.shop.getConfig();
    return {
      type: "shopConfig",
      items: items.map((itemConfig) => shopItemView(itemConfig, account)),
      updatedAt,
      updatedBy,
    };
  }

  /** The session's account, read from the store now, else null after answering NOT_LOGGED_IN. */
  private loggedInAccount(session: Session): AccountRecord | null {
    const account = session.accountId === null ? null : this.deps.accounts.get(session.accountId);
    if (!account) this.sendAccountError(session, "NOT_LOGGED_IN");
    return account;
  }

  /**
   * The session's account if its role grants `permission`, else null after answering
   * FORBIDDEN. The role is read from the store now, not remembered from login, so a
   * demotion takes effect on the next request. A guest has no permissions.
   */
  private accountWithPermission(session: Session, permission: Permission): AccountRecord | null {
    const account = session.accountId === null ? null : this.deps.accounts.get(session.accountId);
    if (account && permissionsFor(account.role).includes(permission)) return account;
    this.sendAdminError(session, "FORBIDDEN", FORBIDDEN_MESSAGE);
    return null;
  }

  private sendAdminError(session: Session, code: AdminErrorCode, message: string): void {
    session.send({ type: "adminError", code, message });
  }

  private attachAccount(session: Session, account: AccountRecord, loginToken: string): void {
    session.accountId = account.id;
    session.loginToken = loginToken;
    session.name = account.username;
    // A logged-in player wears the account's look; an account with none keeps the guest's.
    session.appearance = account.appearance ?? session.appearance;
  }

  /** Waiting for a game or seated in one: identity stays fixed until it ends. */
  private refuseWhileBusy(session: Session): boolean {
    const busy = this.isBusy(session.id);
    if (busy) this.sendAccountError(session, "BUSY");
    return busy;
  }

  /** In the public queue, holding an unclaimed private room, or seated in a room. */
  private isBusy(playerId: PlayerId): boolean {
    return this.deps.matchmaker.isWaiting(playerId) || this.roomOf(playerId) !== undefined;
  }

  /** One account per session: switching accounts, or registering another, needs a logout first. */
  private refuseWhileLoggedIn(session: Session): boolean {
    const loggedIn = session.accountId !== null;
    if (loggedIn) this.sendAccountError(session, "BUSY", LOG_OUT_FIRST_MESSAGE);
    return loggedIn;
  }

  private refuseWhileRateLimited(session: Session): boolean {
    const blocked = session.loginGuard.isBlocked();
    if (blocked) this.sendAccountError(session, "RATE_LIMITED");
    return blocked;
  }

  private sendAccountError(session: Session, code: AccountErrorCode, message = ACCOUNT_ERROR_MESSAGES[code]): void {
    session.send({ type: "accountError", code, message });
  }

  /** Two sessions of the same account are never matched against each other. */
  private canPairWith(playerId: PlayerId): (other: PlayerId) => boolean {
    return (other) => {
      const accountId = this.sessions.get(playerId)?.accountId ?? null;
      const otherAccountId = this.sessions.get(other)?.accountId ?? null;
      return accountId === null || accountId !== otherAccountId;
    };
  }

  private startRoom(aId: PlayerId, bId: PlayerId): void {
    const roomId = this.deps.registry.nextRoomId();
    // Read once here: the room keeps these for its whole life, including any deck it
    // rebuilds mid-game, so a later save only changes rooms that start after it.
    const { settings } = this.deps.gameConfig.getSettings();
    const rules = makeRules({
      tableLength: this.deps.config.tableLength,
      handSize: settings.handSize,
      deck: this.playableDeck(roomId),
    });
    const room = new Room({
      roomId,
      rules,
      roundCount: settings.roundCount,
      moveDeadlineMs: settings.turnSeconds * 1000,
      reconnectGraceMs: this.deps.config.reconnectGraceMs,
      clock: this.deps.clock,
      timers: this.deps.timers,
      send: (pid, m) => this.sendTo(pid, m),
      onResult: (results) => this.recordResults(roomId, results),
      onFinished: (rid) => this.reap(rid),
      logger: this.deps.logger,
      seed: this.deps.config.seed,
      mode: "match",
    });
    this.deps.registry.add(room);
    this.playerRoom.set(aId, roomId);
    this.playerRoom.set(bId, roomId);
    const seatAccounts = new Map<PlayerId, number>();
    for (const playerId of [aId, bId]) {
      const accountId = this.sessions.get(playerId)?.accountId ?? null;
      if (accountId !== null) seatAccounts.set(playerId, accountId);
    }
    this.roomAccounts.set(roomId, seatAccounts);
    for (const playerId of [aId, bId]) {
      const session = this.sessions.get(playerId);
      room.addPlayer(playerId, session?.name ?? "Player", session ? this.allowedLookOf(session) : null);
    }
  }

  /**
   * A practice room: the player in seat `a` against the bot in seat `b`, with fixed rules,
   * no turn clock, and no result. It never touches matchmaking or private-room codes, and
   * it is not in `roomAccounts`, so nothing is recorded.
   */
  private startPracticeRoom(session: Session): void {
    const roomId = this.deps.registry.nextRoomId();
    // No session id has this shape, so no connection can speak for the bot.
    const botId: PlayerId = `bot:${roomId}`;
    const seed = this.deps.config.seed ?? Math.floor(Math.random() * 0x7fffffff);
    const bot = new PracticeBot({
      playerId: botId,
      timers: this.deps.timers,
      seed: (seed ^ PRACTICE_BOT_SEED_SALT) >>> 0,
      // Runs from the bot's timer, detached from any caller: contain a fault to this room.
      submit: (move) => {
        try {
          room.submit(botId, move);
        } catch (error) {
          this.deps.logger.error("practice bot move failed", { roomId, err: String(error) });
        }
      },
      delayMs: BOT_MOVE_DELAY_MS,
    });
    const room: Room = new Room({
      roomId,
      rules: makeRules({ tableLength: TUNING.tableLength, handSize: PRACTICE_HAND_SIZE, deck: STARTING_DECK }),
      roundCount: PRACTICE_ROUND_COUNT,
      moveDeadlineMs: null,
      reconnectGraceMs: this.deps.config.reconnectGraceMs,
      clock: this.deps.clock,
      timers: this.deps.timers,
      send: (recipientId, message) => {
        if (recipientId === botId) bot.receive(message);
        else this.sendTo(recipientId, message);
      },
      // A practice game pays no Lunch Money and records no stats.
      onResult: () => {},
      onFinished: (finishedRoomId) => {
        bot.stop();
        this.reap(finishedRoomId);
      },
      logger: this.deps.logger,
      seed,
      mode: "practice",
      openingHands: { [session.id]: PRACTICE_OPENING_HAND },
    });
    this.deps.registry.add(room);
    this.playerRoom.set(session.id, roomId);
    room.addPlayer(session.id, session.name, this.allowedLookOf(session));
    room.addPlayer(botId, PRACTICE_BOT_NAME, PRACTICE_BOT_LOOK);
  }

  /**
   * The session's look with any shop item it does not own taken off. appearanceSet and
   * logout already keep the session's look allowed; this is the last check before a
   * room captures it for the whole game.
   */
  private allowedLookOf(session: Session): Appearance | null {
    if (session.appearance === null) return null;
    const account = session.accountId === null ? null : this.deps.accounts.get(session.accountId);
    return withoutLockedItems(session.appearance, account?.ownedItems ?? []);
  }

  /**
   * The stored deck, or the starting deck when the stored one has too few catalog
   * cards to play with. A deck with no cards would fail the first time it runs out.
   */
  private playableDeck(roomId: string): readonly DeckEntry[] {
    const { entries } = this.deps.gameConfig.getDeck();
    const catalogCardTotal = entries
      .filter((entry) => CATALOG_CARD_IDS.includes(entry.cardId))
      .reduce((totalCopies, entry) => totalCopies + entry.copies, 0);
    if (catalogCardTotal >= DECK_LIMITS.total.min) return entries;
    this.deps.logger.warn("stored deck is too small; using the starting deck", { roomId, catalogCardTotal });
    return STARTING_DECK;
  }

  /** Records the finished game for each logged-in seat, then sends those players their profile. */
  private recordResults(roomId: string, results: SeatResult[]): void {
    const seatAccounts = this.roomAccounts.get(roomId);
    if (!seatAccounts) return;
    const loggedInResults = results.flatMap((result) => {
      const accountId = seatAccounts.get(result.playerId);
      return accountId === undefined ? [] : [{ ...result, accountId }];
    });
    if (loggedInResults.length === 0) return;
    try {
      this.deps.accounts.recordGames(
        loggedInResults.map(({ accountId, score, kind }) => ({ accountId, score, won: kind === "win" })),
      );
    } catch (error) {
      // The game is over either way; a store fault must not stop the room from being reaped.
      this.deps.logger.error("recording game results failed", { roomId, err: String(error) });
      return;
    }
    for (const { playerId, accountId } of loggedInResults) {
      const account = this.deps.accounts.get(accountId);
      if (account) this.sendTo(playerId, { type: "profile", profile: this.deps.accounts.profileOf(account) });
    }
  }

  private reap(roomId: string): void {
    this.deps.registry.delete(roomId);
    this.roomAccounts.delete(roomId);
    for (const [pid, rid] of [...this.playerRoom]) {
      if (rid !== roomId) continue;
      this.playerRoom.delete(pid);
      const session = this.sessions.get(pid);
      if (session && !session.connected) this.dropSession(session);
    }
  }

  private roomOf(playerId: PlayerId): Room | undefined {
    const roomId = this.playerRoom.get(playerId);
    return roomId ? this.deps.registry.get(roomId) : undefined;
  }

  private sendTo(playerId: PlayerId, msg: ServerMessage): void {
    this.sessions.get(playerId)?.send(msg);
  }

  private dropSession(session: Session): void {
    this.sessions.delete(session.id);
    this.byToken.delete(session.token);
  }
}

function shopItemView(itemConfig: ShopItemConfig, account: AccountRecord): ShopItemView {
  const catalogItem = SHOP_ITEMS.find((item) => item.id === itemConfig.itemId);
  if (!catalogItem) throw new Error(`shopItemView: ${itemConfig.itemId} is not in the catalog`);
  return {
    id: catalogItem.id,
    name: catalogItem.name,
    kind: catalogItem.kind,
    price: itemConfig.price,
    available: itemConfig.available,
    owned: account.ownedItems.includes(catalogItem.id),
  };
}
