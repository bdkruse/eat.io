import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION, type RoomStateMessage, type ServerMessage } from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/index.js";
import type { Transport } from "../src/transport/server.js";

let transport: Transport | undefined;
afterEach(async () => { await transport?.close(); transport = undefined; });

const settle = () => new Promise((r) => setTimeout(r, 50));

function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox: ServerMessage[] = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  const open = new Promise<void>((r) => ws.on("open", () => r()));
  return { ws, inbox, send, open };
}

test("shutdown notifies live rooms before the sockets are torn down", async () => {
  transport = await createServer(loadConfig({ PORT: "0", RNG_SEED: "5" }));
  const a = client(transport.port);
  const b = client(transport.port);
  await Promise.all([a.open, b.open]);

  a.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" });
  b.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Sam" });
  await settle();
  a.send({ type: "queueJoin" });
  b.send({ type: "queueJoin" });
  await settle();

  // A game is in progress; now shut the server down.
  await transport.close();
  transport = undefined;
  await settle();

  for (const c of [a, b]) {
    const states = c.inbox.filter((m): m is RoomStateMessage => m.type === "roomState");
    const final = states[states.length - 1];
    expect(final?.phase).toBe("abandoned");
  }
});
