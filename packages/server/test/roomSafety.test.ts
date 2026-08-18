import { expect, test } from "vitest";
import type { ServerMessage } from "@eat.io/protocol";
import { defaultRules, type Rules } from "../src/engine/rules/index.js";
import { manualTime } from "../src/lobby/timers.js";
import type { Logger } from "../src/logger.js";
import { Room } from "../src/lobby/room.js";

/**
 * Rules that deal normally, then blow up on demand — stands in for an engine bug
 * that surfaces mid-game rather than at construction.
 */
function armableRules(): { rules: Rules; explode: () => void } {
  let armed = false;
  const rules: Rules = {
    ...defaultRules,
    freshTrayValue(rng) {
      if (armed) throw new Error("engine exploded");
      return defaultRules.freshTrayValue(rng);
    },
  };
  return { rules, explode: () => { armed = true; } };
}

function silentLogger(): { logger: Logger; errors: string[] } {
  const errors: string[] = [];
  const noop = () => {};
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: (msg) => errors.push(msg),
    child: () => logger,
  };
  return { logger, errors };
}

function harness(rules: Rules) {
  const sent: Record<string, ServerMessage[]> = { p1: [], p2: [] };
  let sendThrows = false;
  const time = manualTime();
  const { logger, errors } = silentLogger();
  const room = new Room({
    roomId: "r1", rules, roundCount: 10,
    moveDeadlineMs: 20000, reconnectGraceMs: 30000,
    clock: time.clock, timers: time.timers,
    send: (id, msg) => {
      if (sendThrows) throw new Error("send exploded");
      sent[id]!.push(msg);
    },
    onFinished: () => {},
    logger, seed: 5,
  });
  room.addPlayer("p1", "Riley");
  room.addPlayer("p2", "Sam");
  return { room, time, errors, sent, breakSend: () => { sendThrows = true; } };
}

test("an engine exception on the move-deadline timer never escapes the room", () => {
  const { rules, explode } = armableRules();
  const h = harness(rules);
  explode(); // the deal already happened; the next resolution will throw
  // The deadline fires -> autoMove -> resolveRound -> rules throw.
  expect(() => h.time.advance(20000)).not.toThrow();
  expect(h.errors.some((m) => m.includes("room"))).toBe(true);
});

test("an exception on the grace timer never escapes the room", () => {
  const h = harness(defaultRules);
  h.room.markDisconnected("p1");
  h.breakSend(); // abandon()'s broadcast will now throw, from inside the timer
  expect(() => h.time.advance(30000)).not.toThrow();
  expect(h.errors.length).toBeGreaterThan(0);
});

test("a healthy room still resolves normally through the guard", () => {
  const h = harness(defaultRules);
  expect(() => h.time.advance(20000)).not.toThrow();
  const states = h.sent["p1"]!.filter((m) => m.type === "roomState");
  expect(states[states.length - 1]).toMatchObject({ roundIndex: 1 });
});
