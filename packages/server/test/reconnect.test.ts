import { expect, test } from "vitest";
import type { RoomStateMessage, ServerMessage } from "@eat.io/protocol";
import type { PlayerId } from "../src/engine/state.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { manualTime } from "../src/lobby/timers.js";
import { createLogger } from "../src/logger.js";
import { Room } from "../src/lobby/room.js";

function harness() {
  const sent: Record<string, ServerMessage[]> = { p1: [], p2: [] };
  const finished: string[] = [];
  const time = manualTime();
  const room = new Room({
    roomId: "r1", rules: defaultRules, roundCount: 10,
    moveDeadlineMs: 20000, reconnectGraceMs: 30000,
    clock: time.clock, timers: time.timers,
    send: (id, msg) => sent[id]!.push(msg),
    onResult: () => {},
    onFinished: (id) => finished.push(id),
    logger: createLogger("error"), seed: 5, mode: "match",
  });
  room.addPlayer("p1", "Riley", null);
  room.addPlayer("p2", "Sam", null);
  const last = (id: PlayerId, type: string) => {
    const ms = sent[id]!.filter((m) => m.type === type);
    return ms[ms.length - 1];
  };
  return { sent, finished, time, room, last };
}

test("a disconnect pauses the room and notifies the opponent with a grace deadline", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  expect(h.room.phase).toBe("paused");
  expect(h.last("p2", "opponentDisconnected")).toMatchObject({ type: "opponentDisconnected", graceEndsAt: 30000 });
});

test("the move clock is suspended while paused", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  h.time.advance(20000); // would have fired the move deadline if it were still armed
  expect(h.room.phase).toBe("paused"); // no resolution happened
});

test("reconnect within grace resumes and re-broadcasts", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  h.time.advance(10000);
  h.room.markReconnected("p1");
  expect(h.room.phase).toBe("in-progress");
  expect(h.last("p2", "opponentReconnected")).toEqual({ type: "opponentReconnected" });
  expect((h.last("p1", "roomState") as RoomStateMessage).phase).toBe("in-progress");
});

test("grace expiry abandons the room and the survivor sees phase abandoned", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  h.time.advance(30000);
  expect(h.room.phase).toBe("abandoned");
  expect((h.last("p2", "roomState") as RoomStateMessage).phase).toBe("abandoned");
  expect(h.finished).toContain("r1");
});

test("a voluntary leave abandons immediately", () => {
  const h = harness();
  h.room.leave("p1");
  expect(h.room.phase).toBe("abandoned");
  expect(h.finished).toContain("r1");
});
