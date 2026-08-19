import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type RoomStateMessage, type ServerMessage } from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/index.js";
import type { Transport } from "../src/transport/server.js";

let transport: Transport | undefined;
afterEach(async () => { await transport?.close(); transport = undefined; });

function client(port: number, name: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  let cursor = 0; // consuming pointer, so a match from a prior round is never reused
  ws.on("message", (d) => { inbox.push(JSON.parse(d.toString())); waiters.splice(0).forEach((w) => w()); });
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const open = new Promise<void>((r) => ws.on("open", () => r()));
  // Waits for the NEXT (not any past) message matching pred, consuming as it scans.
  async function next(pred: (m: ServerMessage) => boolean): Promise<ServerMessage> {
    for (;;) {
      while (cursor < inbox.length) {
        const m = inbox[cursor++]!;
        if (pred(m)) return m;
      }
      await new Promise<void>((r) => waiters.push(r));
    }
  }
  const lastRoomState = () =>
    [...inbox].reverse().find((m): m is RoomStateMessage => m.type === "roomState");
  return { ws, inbox, send, open, next, lastRoomState, name };
}

test("two clients matchmake and play a full game to gameOver", async () => {
  transport = await createServer(loadConfig({ PORT: "0", RNG_SEED: "5" }));
  const a = client(transport.port, "Riley");
  const b = client(transport.port, "Sam");
  await Promise.all([a.open, b.open]);

  a.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" });
  b.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Sam" });
  await a.next((m) => m.type === "welcome");
  await b.next((m) => m.type === "welcome");

  a.send({ type: "queueJoin" });
  b.send({ type: "queueJoin" });
  await a.next((m) => m.type === "roomState");
  await b.next((m) => m.type === "roomState");

  // Play rounds until the game ends. Sync each round on the resolved roomState
  // (roundIndex advancing) rather than on actionAccepted, which avoids stale matches.
  const reachedRound = (target: number) => (m: ServerMessage) =>
    (m.type === "roomState" && m.roundIndex >= target) || m.type === "gameOver";

  for (let round = 0; round < 10; round++) {
    for (const c of [a, b]) {
      const v = c.lastRoomState()!;
      const card = v.you.hand.find((k) => k.targets === 1)!;
      c.send({
        type: "submitTurn",
        cardInstanceId: card.instanceId,
        targetTrayIds: [v.you.table[0]!.id],
      });
    }
    await a.next(reachedRound(round + 1));
    await b.next(reachedRound(round + 1));
  }

  const overA = await a.next((m) => m.type === "gameOver");
  const overB = await b.next((m) => m.type === "gameOver");
  expect(overA.type).toBe("gameOver");
  expect(overB.type).toBe("gameOver");
  a.ws.close();
  b.ws.close();
}, 15000);
