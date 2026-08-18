import type { PlayerId, GameState, Submission } from "../engine/state.js";
import type { Rules } from "../engine/rules/index.js";
import type { Cancel, Clock, Timers } from "./timers.js";
import type { Logger } from "../logger.js";
import type { RoomPhase, Seat, ServerMessage } from "@eat.io/protocol";
import { createGame } from "../engine/deal.js";
import {
  applyAction,
  autoMove,
  everyoneSubmitted,
  isGameOver,
  rankResult,
  resolveRound,
  resultFor,
  setConnected,
  validateAction,
  viewFor,
} from "../engine/engine.js";

export interface RoomDeps {
  roomId: string;
  rules: Rules;
  roundCount: number;
  moveDeadlineMs: number;
  reconnectGraceMs: number;
  clock: Clock;
  timers: Timers;
  send: (playerId: PlayerId, msg: ServerMessage) => void;
  onFinished: (roomId: string) => void;
  logger: Logger;
  seed: number | null;
}

interface SeatRef {
  id: PlayerId;
  seat: Seat;
  name: string;
}

const SEATS: readonly Seat[] = ["a", "b"];

export class Room {
  readonly id: string;
  private state: GameState | null = null;
  private seats: SeatRef[] = [];
  private deadlineAt: number | null = null;
  protected cancelDeadline: Cancel | null = null;
  protected disconnected = new Set<PlayerId>();
  private cancelGrace: Cancel | null = null;

  constructor(protected readonly deps: RoomDeps) {
    this.id = deps.roomId;
  }

  get phase(): RoomPhase {
    return this.state?.phase ?? "waiting";
  }

  isFull(): boolean {
    return this.seats.length >= 2;
  }

  hasPlayer(id: PlayerId): boolean {
    return this.seats.some((s) => s.id === id);
  }

  addPlayer(playerId: PlayerId, name: string): void {
    if (this.isFull() || this.hasPlayer(playerId)) return;
    this.seats.push({ id: playerId, seat: SEATS[this.seats.length]!, name });
    if (this.isFull()) this.start();
  }

  submit(playerId: PlayerId, action: Submission): void {
    if (!this.state) return;
    const verdict = validateAction(this.state, playerId, action);
    if (!verdict.ok) {
      this.deps.send(playerId, { type: "actionRejected", code: verdict.code, message: verdict.message });
      return;
    }
    this.state = applyAction(this.state, playerId, action);
    this.deps.send(playerId, { type: "actionAccepted" });
    this.broadcast();
    this.tryResolve();
  }

  protected start(): void {
    this.state = createGame({
      roomId: this.id,
      seats: this.seats,
      rules: this.deps.rules,
      roundCount: this.deps.roundCount,
      seed: this.deps.seed ?? Math.floor(Math.random() * 0x7fffffff),
    });
    this.armDeadline();
    this.broadcast();
    this.deps.logger.info("room started", { roomId: this.id });
  }

  protected armDeadline(): void {
    this.cancelDeadline?.();
    this.deadlineAt = this.deps.clock.now() + this.deps.moveDeadlineMs;
    this.cancelDeadline = this.deps.timers.schedule(this.deps.moveDeadlineMs, () =>
      this.guard("move deadline", () => this.onDeadline()),
    );
  }

  protected clearDeadline(): void {
    this.cancelDeadline?.();
    this.cancelDeadline = null;
    this.deadlineAt = null;
  }

  private onDeadline(): void {
    if (!this.state || this.state.phase !== "in-progress") return;
    for (const s of this.seats) {
      const p = this.state.players[s.id];
      if (p && p.connected && !p.submission) this.state = autoMove(this.state, s.id);
    }
    this.tryResolve();
  }

  private tryResolve(): void {
    if (!this.state || !everyoneSubmitted(this.state)) return;
    this.clearDeadline();
    const { state } = resolveRound(this.state, this.deps.rules);
    this.state = state;
    if (isGameOver(this.state)) {
      this.finish();
      return;
    }
    this.armDeadline();
    this.broadcast();
  }

  protected broadcast(): void {
    if (!this.state) return;
    for (const s of this.seats) {
      this.deps.send(s.id, viewFor(this.state, s.id, this.deadlineAt));
    }
  }

  protected finish(): void {
    if (!this.state) return;
    this.clearDeadline();
    this.state = { ...this.state, phase: "finished" };
    const ranked = rankResult(this.state);
    for (const s of this.seats) {
      this.deps.send(s.id, viewFor(this.state, s.id, null));
      this.deps.send(s.id, { type: "gameOver", result: resultFor(ranked, s.seat) });
    }
    this.deps.onFinished(this.id);
    this.deps.logger.info("room finished", { roomId: this.id });
  }

  /**
   * Timer callbacks run detached from any caller, so a fault here would reach the
   * event loop and take down the whole process. Contain it to this room (§1.7).
   */
  private guard(what: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.deps.logger.error("room timer failed", { roomId: this.id, what, err: String(err) });
    }
  }

  protected opponentOf(playerId: PlayerId): SeatRef | undefined {
    return this.seats.find((s) => s.id !== playerId);
  }

  /** Process is going down: resolve the room rather than dropping players silently (§1.7). */
  shutdown(): void {
    this.guard("shutdown", () => this.abandon());
  }

  markDisconnected(playerId: PlayerId): void {
    if (!this.state) {
      // Was still waiting for a second player; nothing to play, reap it.
      this.deps.onFinished(this.id);
      return;
    }
    if (this.state.phase === "finished" || this.state.phase === "abandoned") return;

    this.disconnected.add(playerId);
    this.state = setConnected(this.state, playerId, false);
    this.state = { ...this.state, phase: "paused" };
    this.clearDeadline();

    const graceEndsAt = this.deps.clock.now() + this.deps.reconnectGraceMs;
    const opponent = this.opponentOf(playerId);
    if (opponent) this.deps.send(opponent.id, { type: "opponentDisconnected", graceEndsAt });
    this.cancelGrace?.();
    this.cancelGrace = this.deps.timers.schedule(this.deps.reconnectGraceMs, () =>
      this.guard("reconnect grace", () => this.abandon()),
    );
    this.deps.logger.info("player disconnected; room paused", { roomId: this.id, playerId });
  }

  markReconnected(playerId: PlayerId): void {
    if (!this.state || this.state.phase !== "paused") return;
    if (!this.disconnected.has(playerId)) return;

    this.disconnected.delete(playerId);
    this.state = setConnected(this.state, playerId, true);

    if (this.disconnected.size === 0) {
      this.cancelGrace?.();
      this.cancelGrace = null;
      this.state = { ...this.state, phase: "in-progress" };
      const opponent = this.opponentOf(playerId);
      if (opponent) this.deps.send(opponent.id, { type: "opponentReconnected" });
      this.armDeadline();
    }
    this.broadcast();
    this.deps.logger.info("player reconnected", { roomId: this.id, playerId });
  }

  leave(playerId: PlayerId): void {
    if (!this.state) {
      this.deps.onFinished(this.id);
      return;
    }
    this.abandon();
  }

  private abandon(): void {
    if (!this.state) {
      this.deps.onFinished(this.id);
      return;
    }
    if (this.state.phase === "finished" || this.state.phase === "abandoned") return;
    this.clearDeadline();
    this.cancelGrace?.();
    this.cancelGrace = null;
    this.state = { ...this.state, phase: "abandoned" };
    for (const s of this.seats) {
      const p = this.state.players[s.id];
      if (p?.connected) this.deps.send(s.id, viewFor(this.state, s.id, null));
    }
    this.deps.onFinished(this.id);
    this.deps.logger.info("room abandoned", { roomId: this.id });
  }
}
