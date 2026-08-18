import type { LogLevel } from "./logger.js";

export interface Config {
  port: number;
  roundCount: number;
  moveDeadlineMs: number;
  reconnectGraceMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  tableLength: number;
  handSize: number;
  seed: number | null;
  logLevel: LogLevel;
}

type Env = Record<string, string | undefined>;

function int(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`Config: ${key} must be an integer, got "${raw}"`);
  return n;
}

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export function loadConfig(env: Env = process.env): Config {
  const rawLevel = env["LOG_LEVEL"];
  const logLevel: LogLevel =
    rawLevel && (LEVELS as readonly string[]).includes(rawLevel) ? (rawLevel as LogLevel) : "info";
  const seedRaw = env["RNG_SEED"];
  return {
    port: int(env, "PORT", 8000),
    roundCount: int(env, "ROUND_COUNT", 10),
    moveDeadlineMs: int(env, "MOVE_DEADLINE_MS", 20000),
    reconnectGraceMs: int(env, "RECONNECT_GRACE_MS", 30000),
    heartbeatIntervalMs: int(env, "HEARTBEAT_INTERVAL_MS", 15000),
    heartbeatTimeoutMs: int(env, "HEARTBEAT_TIMEOUT_MS", 10000),
    tableLength: int(env, "TABLE_LENGTH", 5),
    handSize: int(env, "HAND_SIZE", 5),
    seed: seedRaw === undefined || seedRaw === "" ? null : int(env, "RNG_SEED", 0),
    logLevel,
  };
}
