import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AccountsDatabase = Database.Database;

/**
 * Each entry runs once, in order, tracked by `PRAGMA user_version`. Append new
 * migrations rather than editing an entry that has already shipped.
 */
const MIGRATIONS: readonly string[] = [
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
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  return database;
}

function runMigrations(database: AccountsDatabase): void {
  const currentVersion = database.pragma("user_version", { simple: true }) as number;
  for (let migrationVersion = currentVersion; migrationVersion < MIGRATIONS.length; migrationVersion++) {
    database.exec(MIGRATIONS[migrationVersion]!);
    database.pragma(`user_version = ${migrationVersion + 1}`);
  }
}
