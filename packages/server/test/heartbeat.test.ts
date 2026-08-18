import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { startTransport, type Transport, type LobbyLike } from "../src/transport/server.js";

let transport: Transport | undefined;
afterEach(async () => { await transport?.close(); transport = undefined; });

const inertLobby: LobbyLike = { handleMessage: () => {}, handleClose: () => {} };

test("a half-open socket dies on the pong TIMEOUT, not a second heartbeat interval", async () => {
  const INTERVAL = 200;
  const TIMEOUT = 50;
  transport = await startTransport({
    lobby: inertLobby,
    config: loadConfig({
      PORT: "0",
      HEARTBEAT_INTERVAL_MS: String(INTERVAL),
      HEARTBEAT_TIMEOUT_MS: String(TIMEOUT),
    }),
    logger: createLogger("error"),
  });
  const ws = new WebSocket(`ws://127.0.0.1:${transport.port}`);
  await new Promise<void>((r) => ws.on("open", () => r()));

  // Silence the automatic pong so the socket looks half-open.
  ws.pong = () => {};

  const startedAt = Date.now();
  const elapsed = await new Promise<number>((resolve) => {
    ws.on("close", () => resolve(Date.now() - startedAt));
    setTimeout(() => resolve(-1), 1000);
  });

  expect(elapsed).toBeGreaterThan(0);
  // Correct: first ping at ~INTERVAL, terminated ~TIMEOUT later (~250ms).
  // Wrong (timeout ignored): survives until the second interval (~400ms).
  expect(elapsed).toBeLessThan(INTERVAL + TIMEOUT + 80);
});

test("a responsive socket is left alone across several heartbeats", async () => {
  transport = await startTransport({
    lobby: inertLobby,
    config: loadConfig({ PORT: "0", HEARTBEAT_INTERVAL_MS: "40", HEARTBEAT_TIMEOUT_MS: "40" }),
    logger: createLogger("error"),
  });
  const ws = new WebSocket(`ws://127.0.0.1:${transport.port}`);
  await new Promise<void>((r) => ws.on("open", () => r()));

  const closed = await new Promise<boolean>((resolve) => {
    ws.on("close", () => resolve(true));
    setTimeout(() => resolve(false), 400); // several intervals with normal pongs
  });
  expect(closed).toBe(false);
});
