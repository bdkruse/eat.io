import { expect, test } from "vitest";
import type { Room } from "../src/lobby/room.js";
import { RoomRegistry } from "../src/lobby/registry.js";

const fakeRoom = (id: string) => ({ id }) as unknown as Room;

test("ids are unique and rooms can be added, fetched, and reaped", () => {
  const reg = new RoomRegistry();
  const id1 = reg.nextRoomId();
  const id2 = reg.nextRoomId();
  expect(id1).not.toBe(id2);

  reg.add(fakeRoom(id1));
  reg.add(fakeRoom(id2));
  expect(reg.size).toBe(2);
  expect(reg.get(id1)?.id).toBe(id1);

  reg.delete(id1);
  expect(reg.size).toBe(1);
  expect(reg.get(id1)).toBeUndefined();
});
