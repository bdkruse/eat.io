import type { PlayerId } from "../engine/state.js";

/** Whether the joining player may be paired with `other`. Absent means anyone. */
export type CanPairWith = (other: PlayerId) => boolean;

const ANYONE: CanPairWith = () => true;

export class Matchmaker {
  private queue: PlayerId[] = [];
  private privateRooms = new Map<string, PlayerId>(); // code -> host

  constructor(private readonly genCode: () => string) {}

  joinPublic(
    playerId: PlayerId,
    canPairWith: CanPairWith = ANYONE,
  ): { paired: true; opponent: PlayerId } | { paired: false } {
    const waiting = this.queue.find((id) => id !== playerId && canPairWith(id));
    if (waiting) {
      this.queue = this.queue.filter((id) => id !== waiting);
      return { paired: true, opponent: waiting };
    }
    if (!this.queue.includes(playerId)) this.queue.push(playerId);
    return { paired: false };
  }

  cancelPublic(playerId: PlayerId): void {
    this.queue = this.queue.filter((id) => id !== playerId);
  }

  createPrivate(playerId: PlayerId): string {
    let code = this.genCode();
    while (this.privateRooms.has(code)) code = this.genCode();
    this.privateRooms.set(code, playerId);
    return code;
  }

  joinPrivate(
    playerId: PlayerId,
    code: string,
    canPairWith: CanPairWith = ANYONE,
  ): { ok: true; host: PlayerId } | { ok: false; reason: string } {
    const host = this.privateRooms.get(code);
    if (!host) return { ok: false, reason: "no such room" };
    if (host === playerId || !canPairWith(host)) return { ok: false, reason: "cannot join your own room" };
    this.privateRooms.delete(code);
    return { ok: true, host };
  }

  /** True while the player is in the public queue or holds an unclaimed private code. */
  isWaiting(playerId: PlayerId): boolean {
    if (this.queue.includes(playerId)) return true;
    for (const host of this.privateRooms.values()) {
      if (host === playerId) return true;
    }
    return false;
  }

  remove(playerId: PlayerId): void {
    this.cancelPublic(playerId);
    for (const [code, host] of this.privateRooms) {
      if (host === playerId) this.privateRooms.delete(code);
    }
  }
}
