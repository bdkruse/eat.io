import {
  PROTOCOL_VERSION,
  type AccountErrorCode,
  type ClientMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import type { AccountRecord, AccountStore } from "../accounts/accountStore.js";
import type { PlayerId } from "../engine/state.js";
import type { Rules } from "../engine/rules/index.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { Clock, Timers } from "./timers.js";
import { Session, type SendFn } from "../session/session.js";
import { Matchmaker } from "./matchmaking.js";
import { RoomRegistry } from "./registry.js";
import { Room, type SeatResult } from "./room.js";

export interface Connection {
  send: SendFn;
  session: Session | null;
}

export interface LobbyDeps {
  config: Config;
  rules: Rules;
  clock: Clock;
  timers: Timers;
  registry: RoomRegistry;
  matchmaker: Matchmaker;
  logger: Logger;
  genId: () => string;
  genToken: () => string;
  accounts: AccountStore;
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
};

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
        session.appearance = msg.appearance;
        if (session.accountId !== null) this.deps.accounts.saveAppearance(session.accountId, msg.appearance);
        break;
      case "profileRequest": {
        const account = session.accountId === null ? null : this.deps.accounts.get(session.accountId);
        if (!account) {
          this.sendAccountError(session, "NOT_LOGGED_IN");
          break;
        }
        session.send({ type: "profile", profile: this.deps.accounts.profileOf(account) });
        break;
      }
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
    if (this.refuseWhileBusy(session) || this.refuseWhileRateLimited(session)) return;
    const registration = this.deps.accounts.register(username, password);
    if (!registration.ok) {
      this.sendAccountError(session, registration.code);
      return;
    }
    this.completeLogin(session, registration.account);
  }

  private handleLogin(session: Session, username: string, password: string): void {
    if (this.refuseWhileBusy(session) || this.refuseWhileRateLimited(session)) return;
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

  private attachAccount(session: Session, account: AccountRecord, loginToken: string): void {
    session.accountId = account.id;
    session.loginToken = loginToken;
    session.name = account.username;
    // A logged-in player wears the account's look; an account with none keeps the guest's.
    session.appearance = account.appearance ?? session.appearance;
  }

  /** Waiting for a game or seated in one: identity stays fixed until it ends. */
  private refuseWhileBusy(session: Session): boolean {
    const busy = this.deps.matchmaker.isWaiting(session.id) || this.roomOf(session.id) !== undefined;
    if (busy) this.sendAccountError(session, "BUSY");
    return busy;
  }

  private refuseWhileRateLimited(session: Session): boolean {
    const blocked = session.loginGuard.isBlocked();
    if (blocked) this.sendAccountError(session, "RATE_LIMITED");
    return blocked;
  }

  private sendAccountError(session: Session, code: AccountErrorCode): void {
    session.send({ type: "accountError", code, message: ACCOUNT_ERROR_MESSAGES[code] });
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
    const room = new Room({
      roomId,
      rules: this.deps.rules,
      roundCount: this.deps.config.roundCount,
      moveDeadlineMs: this.deps.config.moveDeadlineMs,
      reconnectGraceMs: this.deps.config.reconnectGraceMs,
      clock: this.deps.clock,
      timers: this.deps.timers,
      send: (pid, m) => this.sendTo(pid, m),
      onResult: (results) => this.recordResults(roomId, results),
      onFinished: (rid) => this.reap(rid),
      logger: this.deps.logger,
      seed: this.deps.config.seed,
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
      room.addPlayer(playerId, session?.name ?? "Player", session?.appearance ?? null);
    }
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
