import type { PlayerId } from "../engine/state.js";

export class Matchmaker {
  private queue: PlayerId[] = [];
  private privateRooms = new Map<string, PlayerId>(); // code -> host

  constructor(private readonly genCode: () => string) {}

  joinPublic(playerId: PlayerId): { paired: true; opponent: PlayerId } | { paired: false } {
    const waiting = this.queue.find((id) => id !== playerId);
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
  ): { ok: true; host: PlayerId } | { ok: false; reason: string } {
    const host = this.privateRooms.get(code);
    if (!host) return { ok: false, reason: "no such room" };
    if (host === playerId) return { ok: false, reason: "cannot join your own room" };
    this.privateRooms.delete(code);
    return { ok: true, host };
  }

  remove(playerId: PlayerId): void {
    this.cancelPublic(playerId);
    for (const [code, host] of this.privateRooms) {
      if (host === playerId) this.privateRooms.delete(code);
    }
  }
}
