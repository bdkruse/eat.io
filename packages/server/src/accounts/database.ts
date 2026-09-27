import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AccountsDatabase = Database.Database;

const LOCK_WAIT_MS = 5000;
const LOCKED_RETRY_ATTEMPTS = 50;
const LOCKED_RETRY_PAUSE_MS = 100;

/**
 * Each entry runs once, in order, tracked by `PRAGMA user_version`. Append new
 * migrations rather than editing an entry that has already shipped.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin', 'creator')),
    appearance TEXT,
    points_scored INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE login_tokens (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX login_tokens_account ON login_tokens(account_id);
  `,
  `
  CREATE TABLE game_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    round_count INTEGER NOT NULL,
    turn_seconds INTEGER NOT NULL,
    hand_size INTEGER NOT NULL,
    updated_at INTEGER,
    updated_by INTEGER REFERENCES accounts(id)
  );
  CREATE TABLE default_deck (
    card_id TEXT PRIMARY KEY,
    copies INTEGER NOT NULL CHECK (copies BETWEEN 0 AND 40)
  );
  CREATE TABLE default_deck_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    updated_at INTEGER,
    updated_by INTEGER REFERENCES accounts(id)
  );
  `,
];

/**
 * Opens the accounts database at `path` (creating parent directories for a file
 * path; use ":memory:" for tests), sets journal_mode=WAL and foreign_keys=ON, and
 * runs any migrations not yet applied, tracked by PRAGMA user_version.
 */
export function openAccountsDatabase(path: string): AccountsDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = new Database(path);
  // A host can start two copies of the server at once during a restart. Wait for the
  // other copy's lock instead of failing on it.
  database.pragma(`busy_timeout = ${LOCK_WAIT_MS}`);
  retryWhileLocked(() => database.pragma("journal_mode = WAL"));
  database.pragma("foreign_keys = ON");
  retryWhileLocked(() => runMigrations(database));
  return database;
}

/**
 * SQLite answers "database is locked" at once, without using busy_timeout, while
 * another process is switching a fresh file to WAL. Only that error is retried, briefly.
 */
function retryWhileLocked<Result>(operation: () => Result): Result {
  for (let attempt = 1; ; attempt++) {
    try {
      return operation();
    } catch (error) {
      const locked = error instanceof Error && /database is locked|SQLITE_BUSY/.test(`${error.message} ${(error as { code?: string }).code ?? ""}`);
      if (!locked || attempt >= LOCKED_RETRY_ATTEMPTS) throw error;
      // Startup only, so a synchronous pause is fine: nothing else is running yet.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCKED_RETRY_PAUSE_MS);
    }
  }
}

/**
 * One write-locked transaction: the version is read under the lock, so a second process
 * that was waiting sees the migrations the first one applied and skips them. A migration
 * that fails partway rolls back with its version bump.
 */
function runMigrations(database: AccountsDatabase): void {
  const migrate = database.transaction(() => {
    const currentVersion = database.pragma("user_version", { simple: true }) as number;
    for (let migrationVersion = currentVersion; migrationVersion < MIGRATIONS.length; migrationVersion++) {
      database.exec(MIGRATIONS[migrationVersion]!);
      database.pragma(`user_version = ${migrationVersion + 1}`);
    }
  });
  migrate.immediate();
}
