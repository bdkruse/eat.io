import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import type { PlayerId } from "../engine/state.js";
import type { Rules } from "../engine/rules/index.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { Clock, Timers } from "./timers.js";
import { Session, type SendFn } from "../session/session.js";
import { Matchmaker } from "./matchmaking.js";
import { RoomRegistry } from "./registry.js";
import { Room } from "./room.js";

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
}

export class Lobby {
  private sessions = new Map<string, Session>();
  private byToken = new Map<string, Session>();
  private playerRoom = new Map<PlayerId, string>();

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
        const result = this.deps.matchmaker.joinPublic(playerId);
        if (result.paired) this.startRoom(result.opponent, playerId);
        else this.sendTo(playerId, { type: "queueWaiting" });
        break;
      }
      case "queueCancel":
        this.deps.matchmaker.cancelPublic(playerId);
        session.send({ type: "queueCancelled" });
        break;
      case "roomCreatePrivate":
        session.send({ type: "roomJoinedPrivate", code: this.deps.matchmaker.createPrivate(playerId) });
        break;
      case "roomJoinPrivate": {
        const result = this.deps.matchmaker.joinPrivate(playerId, msg.code);
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
        room.submit(playerId, { cardId: msg.cardId, targetTrayIds: msg.targetTrayIds });
        break;
      }
      case "roomLeave": {
        this.deps.matchmaker.remove(playerId);
        this.roomOf(playerId)?.leave(playerId);
        session.send({ type: "roomLeft" });
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
    const session = new Session({ id, name: msg.name, token, send: conn.send });
    this.sessions.set(id, session);
    this.byToken.set(token, session);
    conn.session = session;
    session.send({ type: "welcome", playerId: id, sessionToken: token });
    this.deps.logger.info("session created", { playerId: id });
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
      onFinished: (rid) => this.reap(rid),
      logger: this.deps.logger,
      seed: this.deps.config.seed,
    });
    this.deps.registry.add(room);
    this.playerRoom.set(aId, roomId);
    this.playerRoom.set(bId, roomId);
    room.addPlayer(aId, this.sessions.get(aId)?.name ?? "Player");
    room.addPlayer(bId, this.sessions.get(bId)?.name ?? "Player");
  }

  private reap(roomId: string): void {
    this.deps.registry.delete(roomId);
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
