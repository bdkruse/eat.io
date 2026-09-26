import { createHash, randomBytes } from "node:crypto";
import {
  AppearanceSchema,
  isValidPassword,
  isValidUsername,
  permissionsFor,
  type Appearance,
  type Profile,
  type Role,
} from "@eat.io/protocol";
import type { Clock } from "../lobby/timers.js";
import type { AccountsDatabase } from "./database.js";
import { hashPassword, verifyPassword } from "./passwords.js";

const LOGIN_TOKEN_BYTES = 32;
const LOGIN_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_ROLE: Role = "player";

export interface AccountRecord {
  id: number;
  username: string;
  role: Role;
  appearance: Appearance | null;
  pointsScored: number;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: number;
  lastLoginAt: number | null;
}

export type RegisterResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; code: "INVALID_USERNAME" | "INVALID_PASSWORD" | "USERNAME_TAKEN" };

export interface GameRecord {
  accountId: number;
  score: number;
  won: boolean;
}

interface AccountRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  appearance: string | null;
  points_scored: number;
  games_played: number;
  games_won: number;
  created_at: number;
  last_login_at: number | null;
}

interface LoginTokenRow {
  account_id: number;
  expires_at: number;
}

export class AccountStore {
  constructor(
    private readonly database: AccountsDatabase,
    private readonly clock: Clock,
  ) {}

  register(username: string, password: string, role: Role = DEFAULT_ROLE): RegisterResult {
    if (!isValidUsername(username)) return { ok: false, code: "INVALID_USERNAME" };
    if (!isValidPassword(password)) return { ok: false, code: "INVALID_PASSWORD" };
    if (this.findByUsername(username)) return { ok: false, code: "USERNAME_TAKEN" };

    const passwordHash = hashPassword(password);
    const createdAt = this.clock.now();
    const inserted = this.database
      .prepare(
        "INSERT INTO accounts (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(username, passwordHash, role, createdAt);
    const account = this.get(Number(inserted.lastInsertRowid));
    if (!account) throw new Error("register: inserted account could not be reloaded");
    return { ok: true, account };
  }

  verifyLogin(username: string, password: string): AccountRecord | null {
    const row = this.rowByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash)) return null;
    return this.rowToRecord(row);
  }

  recordLogin(accountId: number): AccountRecord {
    this.database
      .prepare("UPDATE accounts SET last_login_at = ? WHERE id = ?")
      .run(this.clock.now(), accountId);
    const account = this.get(accountId);
    if (!account) throw new Error(`recordLogin: no such account ${accountId}`);
    return account;
  }

  createLoginToken(accountId: number): string {
    const token = randomBytes(LOGIN_TOKEN_BYTES).toString("hex");
    const now = this.clock.now();
    this.database
      .prepare(
        "INSERT INTO login_tokens (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run(hashToken(token), accountId, now, now + LOGIN_TOKEN_TTL_MS);
    return token;
  }

  resumeLoginToken(token: string): AccountRecord | null {
    const tokenHash = hashToken(token);
    const row = this.database
      .prepare("SELECT account_id, expires_at FROM login_tokens WHERE token_hash = ?")
      .get(tokenHash) as LoginTokenRow | undefined;
    if (!row) return null;
    if (row.expires_at <= this.clock.now()) {
      this.database.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(tokenHash);
      return null;
    }
    return this.get(row.account_id);
  }

  deleteLoginToken(token: string): void {
    this.database.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(hashToken(token));
  }

  deleteOtherLoginTokens(accountId: number, keepToken: string | null): void {
    if (keepToken === null) {
      this.database.prepare("DELETE FROM login_tokens WHERE account_id = ?").run(accountId);
      return;
    }
    this.database
      .prepare("DELETE FROM login_tokens WHERE account_id = ? AND token_hash != ?")
      .run(accountId, hashToken(keepToken));
  }

  sweepExpiredTokens(): number {
    const result = this.database
      .prepare("DELETE FROM login_tokens WHERE expires_at <= ?")
      .run(this.clock.now());
    return result.changes;
  }

  changePassword(
    accountId: number,
    currentPassword: string,
    newPassword: string,
  ): "ok" | "WRONG_PASSWORD" | "INVALID_PASSWORD" {
    const row = this.rowById(accountId);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) return "WRONG_PASSWORD";
    if (!isValidPassword(newPassword)) return "INVALID_PASSWORD";

    this.database
      .prepare("UPDATE accounts SET password_hash = ? WHERE id = ?")
      .run(hashPassword(newPassword), accountId);
    return "ok";
  }

  saveAppearance(accountId: number, appearance: Appearance): void {
    this.database
      .prepare("UPDATE accounts SET appearance = ? WHERE id = ?")
      .run(JSON.stringify(appearance), accountId);
  }

  recordGames(records: GameRecord[]): void {
    const updateOne = this.database.prepare(
      "UPDATE accounts SET points_scored = points_scored + ?, games_played = games_played + 1, games_won = games_won + ? WHERE id = ?",
    );
    const updateAll = this.database.transaction((entries: GameRecord[]) => {
      for (const entry of entries) {
        updateOne.run(entry.score, entry.won ? 1 : 0, entry.accountId);
      }
    });
    updateAll(records);
  }

  get(accountId: number): AccountRecord | null {
    const row = this.rowById(accountId);
    return row ? this.rowToRecord(row) : null;
  }

  findByUsername(username: string): AccountRecord | null {
    const row = this.rowByUsername(username);
    return row ? this.rowToRecord(row) : null;
  }

  setRole(accountId: number, role: Role): void {
    this.database.prepare("UPDATE accounts SET role = ? WHERE id = ?").run(role, accountId);
  }

  profileOf(account: AccountRecord): Profile {
    return {
      username: account.username,
      role: account.role,
      permissions: permissionsFor(account.role),
      appearance: account.appearance,
      pointsScored: account.pointsScored,
      gamesPlayed: account.gamesPlayed,
      gamesWon: account.gamesWon,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
    };
  }

  private rowById(accountId: number): AccountRow | undefined {
    return this.database.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as
      | AccountRow
      | undefined;
  }

  private rowByUsername(username: string): AccountRow | undefined {
    return this.database.prepare("SELECT * FROM accounts WHERE username = ? COLLATE NOCASE").get(username) as
      | AccountRow
      | undefined;
  }

  private rowToRecord(row: AccountRow): AccountRecord {
    return {
      id: row.id,
      username: row.username,
      role: row.role as Role,
      appearance: parseAppearance(row.appearance),
      pointsScored: row.points_scored,
      gamesPlayed: row.games_played,
      gamesWon: row.games_won,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseAppearance(stored: string | null): Appearance | null {
  if (!stored) return null;
  try {
    return AppearanceSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}
