import { expect, test } from "vitest";
import type { PlayerId } from "../src/engine/state.js";
import type { RoomStateMessage } from "@eat.io/protocol";
import type { ServerMessage } from "@eat.io/protocol";
import { defaultRules } from "../src/engine/rules/index.js";
import { manualTime } from "../src/lobby/timers.js";
import { createLogger } from "../src/logger.js";
import { Room } from "../src/lobby/room.js";

function harness() {
  const sent: Record<string, ServerMessage[]> = { p1: [], p2: [] };
  const finished: string[] = [];
  const time = manualTime();
  const room = new Room({
    roomId: "r1",
    rules: defaultRules,
    roundCount: 10,
    moveDeadlineMs: 20000,
    reconnectGraceMs: 30000,
    clock: time.clock,
    timers: time.timers,
    send: (id, msg) => sent[id]!.push(msg),
    onFinished: (id) => finished.push(id),
    logger: createLogger("error"),
    seed: 5,
  });
  room.addPlayer("p1", "Riley");
  room.addPlayer("p2", "Sam");
  const lastState = (id: PlayerId): RoomStateMessage => {
    const states = sent[id]!.filter((m): m is RoomStateMessage => m.type === "roomState");
    return states[states.length - 1]!;
  };
  return { sent, finished, time, room, lastState };
}

test("starting seats two players and broadcasts an in-progress view with a deadline", () => {
  const h = harness();
  expect(h.room.phase).toBe("in-progress");
  const v = h.lastState("p1");
  expect(v.you.seat).toBe("a");
  expect(v.opponent.seat).toBe("b");
  expect(v.deadlineAt).toBe(20000); // clock started at 0
});

test("a legal submit is accepted and reflected; an illegal one is rejected", () => {
  const h = harness();
  const v = h.lastState("p1");
  const card = v.you.hand.find((c) => c.targets === 1)!;
  const tray = v.you.table[0]!;
  h.room.submit("p1", { cardId: card.id, targetTrayIds: [tray.id] });
  expect(h.sent["p1"]!.some((m) => m.type === "actionAccepted")).toBe(true);
  expect(h.lastState("p1").you.submitted).toBe(true);

  h.room.submit("p2", { cardId: "no-such-card", targetTrayIds: [] });
  const rej = h.sent["p2"]!.find((m) => m.type === "actionRejected");
  expect(rej).toMatchObject({ type: "actionRejected", code: "CARD_NOT_HELD" });
});

test("when both submit, the round resolves and roundIndex advances", () => {
  const h = harness();
  for (const id of ["p1", "p2"] as const) {
    const v = h.lastState(id);
    const card = v.you.hand.find((c) => c.targets === 1)!;
    h.room.submit(id, { cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
  }
  expect(h.lastState("p1").roundIndex).toBe(1);
});

test("an expired deadline auto-discards for the idle player and resolves", () => {
  const h = harness();
  const v = h.lastState("p1");
  const card = v.you.hand.find((c) => c.targets === 1)!;
  h.room.submit("p1", { cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
  // p2 never submits; advance past the 20s deadline
  h.time.advance(20000);
  expect(h.lastState("p1").roundIndex).toBe(1);
});

test("the game ends after roundCount rounds with a per-player gameOver", () => {
  const h = harness();
  for (let r = 0; r < 10; r++) {
    for (const id of ["p1", "p2"] as const) {
      const v = h.lastState(id);
      const card = v.you.hand.find((c) => c.targets === 1)!;
      h.room.submit(id, { cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
    }
  }
  expect(h.room.phase).toBe("finished");
  expect(h.sent["p1"]!.some((m) => m.type === "gameOver")).toBe(true);
  expect(h.sent["p2"]!.some((m) => m.type === "gameOver")).toBe(true);
  expect(h.finished).toContain("r1");
});
