import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { makeRules } from "./engine/rules/index.js";
import { systemClock, systemTimers } from "./lobby/timers.js";
import { Matchmaker } from "./lobby/matchmaking.js";
import { RoomRegistry } from "./lobby/registry.js";
import { Lobby } from "./lobby/lobby.js";
import { startTransport, type Transport } from "./transport/server.js";
import { openAccountsDatabase } from "./accounts/database.js";
import { AccountStore } from "./accounts/accountStore.js";

/** A four-digit room code — easy to read aloud and type. Collisions are retried by the
 *  matchmaker, and 10,000 codes is ample for the concurrent rooms this process holds. */
function randomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

export async function createServer(config: Config = loadConfig()): Promise<Transport> {
  const logger = createLogger(config.logLevel, { app: "eatio" });
  const database = openAccountsDatabase(config.databasePath);
  const accounts = new AccountStore(database, systemClock);
  const sweptTokenCount = accounts.sweepExpiredTokens();
  if (sweptTokenCount > 0) logger.info("expired login tokens swept", { count: sweptTokenCount });
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
    accounts,
  });
  const transport = await startTransport({ lobby, config, logger });
  return {
    port: transport.port,
    close: async () => {
      try {
        await transport.close();
      } finally {
        database.close();
      }
    },
  };
}

// Run when executed directly — `tsx packages/server/src/index.ts` in development, or
// `node server.mjs` for the deployed bundle. Real paths, so symlinks and URL escaping
// in the path cannot make the check miss.
function runDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
const isMain = runDirectly();
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
  }).catch((error: unknown) => {
    // A server that cannot open its database or port must exit, so the host restarts it,
    // instead of lingering half-started.
    logger.error("startup failed", { err: String(error) });
    process.exit(1);
  });
}
