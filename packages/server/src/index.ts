import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { makeRules } from "./engine/rules/index.js";
import { systemClock, systemTimers } from "./lobby/timers.js";
import { Matchmaker } from "./lobby/matchmaking.js";
import { RoomRegistry } from "./lobby/registry.js";
import { Lobby } from "./lobby/lobby.js";
import { startTransport, type Transport } from "./transport/server.js";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createServer(config: Config = loadConfig()): Promise<Transport> {
  const logger = createLogger(config.logLevel, { app: "eatio" });
  const lobby = new Lobby({
    config,
    rules: makeRules({ tableLength: config.tableLength, handSize: config.handSize }),
    clock: systemClock,
    timers: systemTimers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(randomCode),
    logger,
    genId: () => randomUUID(),
    genToken: () => randomUUID(),
  });
  return startTransport({ lobby, config, logger });
}

// Run when executed directly (tsx packages/server/src/index.ts).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { app: "eatio" });

  process.on("uncaughtException", (err) => logger.error("uncaughtException", { err: String(err) }));
  process.on("unhandledRejection", (err) => logger.error("unhandledRejection", { err: String(err) }));

  createServer(config).then((transport) => {
    const shutdown = async (signal: string) => {
      logger.info("shutting down", { signal });
      await transport.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  });
}
