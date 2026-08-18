import type { Room } from "./room.js";

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private seq = 0;

  nextRoomId(): string {
    this.seq += 1;
    return `room-${this.seq}`;
  }

  add(room: Room): void {
    this.rooms.set(room.id, room);
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  delete(id: string): void {
    this.rooms.delete(id);
  }

  /** Snapshot of the live rooms — a snapshot, because reaping mutates the map. */
  list(): Room[] {
    return [...this.rooms.values()];
  }

  get size(): number {
    return this.rooms.size;
  }
}
