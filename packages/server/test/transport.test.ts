import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { startTransport, type Transport, type LobbyLike } from "../src/transport/server.js";
import type { Connection } from "../src/lobby/lobby.js";

let transport: Transport | undefined;
afterEach(async () => { await transport?.close(); transport = undefined; });

function recordingLobby() {
  const messages: ClientMessage[] = [];
  let closed = 0;
  const lobby: LobbyLike = {
    handleMessage: (_conn: Connection, msg) => { messages.push(msg); },
    handleClose: () => { closed++; },
  };
  return { lobby, messages, closedCount: () => closed };
}

function open(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox: ServerMessage[] = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  return { ws, inbox, ready: new Promise<void>((res) => ws.on("open", () => res())) };
}

const nextTick = () => new Promise((r) => setTimeout(r, 20));

test("malformed JSON gets a typed error and does not reach the lobby", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const c = open(transport.port);
  await c.ready;
  c.ws.send("{not json");
  await nextTick();
  expect(c.inbox[0]).toMatchObject({ type: "error", code: "BAD_JSON" });
  expect(rec.messages).toHaveLength(0);
});

test("a schema-invalid message is rejected with a typed error", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const c = open(transport.port);
  await c.ready;
  c.ws.send(JSON.stringify({ type: "definitelyNotAMessage" }));
  await nextTick();
  expect(c.inbox[0]).toMatchObject({ type: "error", code: "BAD_MESSAGE" });
  expect(rec.messages).toHaveLength(0);
});

test("a valid message reaches the lobby; closing calls handleClose", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const c = open(transport.port);
  await c.ready;
  c.ws.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" }));
  await nextTick();
  expect(rec.messages[0]).toMatchObject({ type: "hello", name: "Riley" });
  c.ws.close();
  await nextTick();
  expect(rec.closedCount()).toBe(1);
});

test("a plain web request gets a 200 so hosting health checks see the server as up", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const response = await fetch(`http://127.0.0.1:${transport.port}/`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("ok");
});
