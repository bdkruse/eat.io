import { expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomStateMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import { defaultRules } from "../src/engine/rules/index.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { manualTime } from "../src/lobby/timers.js";
import { Matchmaker } from "../src/lobby/matchmaking.js";
import { RoomRegistry } from "../src/lobby/registry.js";
import { Lobby, type Connection } from "../src/lobby/lobby.js";

function makeLobby() {
  let idSeq = 0, tokSeq = 0, codeSeq = 0;
  const time = manualTime();
  const lobby = new Lobby({
    config: loadConfig({ RNG_SEED: "5", ROUND_COUNT: "2" }),
    rules: defaultRules,
    clock: time.clock,
    timers: time.timers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(() => `C${++codeSeq}`),
    logger: createLogger("error"),
    genId: () => `player-${++idSeq}`,
    genToken: () => `tok-${++tokSeq}`,
  });
  return lobby;
}

function conn() {
  const out: ServerMessage[] = [];
  const c: Connection = { send: (m) => out.push(m), session: null };
  return { c, out };
}

const hello = (name: string): ClientMessage => ({ type: "hello", protocolVersion: PROTOCOL_VERSION, name });
const lastState = (out: ServerMessage[]) =>
  [...out].reverse().find((m): m is RoomStateMessage => m.type === "roomState");

/** Plays a 2-round game to completion. */
function playToEnd(lobby: Lobby, a: ReturnType<typeof conn>, b: ReturnType<typeof conn>) {
  for (let round = 0; round < 2; round++) {
    for (const side of [a, b]) {
      const view = lastState(side.out)!;
      const card = view.you.hand.find((c) => c.targets === 1)!;
      lobby.handleMessage(side.c, {
        type: "submitTurn",
        cardId: card.id,
        targetTrayIds: [view.you.table[0]!.id],
      });
    }
  }
}

test("after a game ends, both players can queue again and land in a fresh room", () => {
  const lobby = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });

  playToEnd(lobby, a, b);
  expect(a.out.some((m) => m.type === "gameOver")).toBe(true);

  const roundsBefore = lastState(a.out)!.roundIndex;
  expect(roundsBefore).toBe(2);

  // "Play again" — the design's Game Over screen returns the player to the queue.
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });

  const fresh = lastState(a.out)!;
  expect(fresh.roundIndex).toBe(0);          // a genuinely new game
  expect(fresh.phase).toBe("in-progress");
  expect(fresh.you.score).toBe(0);           // no score carried over
  expect(fresh.opponent.score).toBe(0);
});
