# eat.io Accounts, Roles, and Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Username-and-password accounts in SQLite, login over the WebSocket, saved appearance, stats, roles, a seed command, and a profile UI, with guest play unchanged.

**Architecture:** The protocol package gains the shared shapes (appearance, profile, roles, permissions) and the new messages. A new `packages/server/src/accounts/` module owns SQLite and passwords. The lobby receives an `AccountStore` dependency the way it receives the clock. The engine is untouched: the room adds appearances to the engine's game view and reports results through a callback. The client adds account state to its reducer, and menu and profile panels.

**Tech Stack:** TypeScript strict (ESM), zod, ws, better-sqlite3 13, node:crypto scrypt, vitest, React 19 + React Three Fiber.

**Spec:** `docs/superpowers/specs/2026-09-26-eat-io-accounts-design.md`

## Global Constraints

- Branch `accounts`. Run `npm test` and `npm run typecheck` from the repo root. Both must pass at the end of every task.
- The engine (`packages/server/src/engine/`) never imports accounts, the database, or appearance.
- No module-level mutable state in the server. The database handle is opened in `packages/server/src/index.ts` and passed down.
- Time comes from the injected `Clock` (`deps.clock.now()`), never `Date.now()`, in server code under `src/lobby` and `src/accounts`.
- Protocol version becomes `3`.
- Usernames: `^[A-Za-z0-9_-]{3,14}$`, unique regardless of capitals. Passwords: 8 to 128 characters.
- Login tokens: 32 random bytes, hex encoded, stored only as SHA-256 hex, valid 30 days (`30 * 24 * 60 * 60 * 1000` ms).
- Brute-force guard: 5 failures within 60 000 ms on one session gives `RATE_LIMITED` for the rest of that window.
- Roles: `player` (default), `admin`, `creator`. Permissions: `["admin.open"]`. Creator gets every permission.
- Seed list: Bain → creator. Noah, Ruby, Mindi → admin. No passwords in the repo.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never "plate."
- Full, descriptive variable names (`username_index`, not `idx`).
- Commits end with no Claude or Anthropic attribution lines.

## Review Focus

1. Two browser tabs logged in to the same account both queue. Expect them never to be paired with each other.
2. A player logs in, then the socket drops and reconnects with the session token. Expect the session to stay logged in.
3. A room is abandoned (a player leaves or the grace window expires). Expect no stats recorded for anyone.
4. `hello` carries an expired or unknown login token. Expect `welcome`, then `accountLoggedOut` with reason `expired`, and guest play.
5. A password change. Expect other devices' tokens deleted and the current device still logged in.

Each of these has a test in the task that owns the code.

---

### Task 1: Protocol version 3

**Files:**
- Create: `packages/protocol/src/accounts.ts`
- Modify: `packages/protocol/src/messages.ts`, `packages/protocol/src/version.ts`, `packages/protocol/src/index.ts`
- Modify: `packages/server/PROTOCOL.md` (document every new message)
- Test: `packages/protocol/test/accounts.test.ts`, `packages/protocol/test/messages.test.ts`

**Interfaces (produces):**

`packages/protocol/src/accounts.ts`:

```ts
export const SKIN_TONES = ["#f6d7bf", "#eec19b", "#d9a47a", "#b87a4f", "#8d5634", "#5e3a24"] as const;
export const HAIR_STYLES = ["short", "bob", "curly", "ponytail", "buzz", "puffs"] as const;
export const HAIR_COLORS = ["#2b2220", "#3d2a1e", "#5a3825", "#8a3b1f", "#c4622d", "#d9b25f"] as const;
export const SHIRT_COLORS = ["#d94f3d", "#4a7fa5", "#5f9e4a", "#e8a33d", "#7d5ba6", "#3e9c95", "#e07a9a", "#f4f1ea"] as const;
export const PANTS_COLORS = ["#3f5a7a", "#b59a6d", "#444a52", "#6b7048"] as const;
export const ACCESSORIES = ["none", "glasses", "cap", "headband", "beanie"] as const;

export const AppearanceSchema = z.object({
  skinTone: z.enum(SKIN_TONES), hairStyle: z.enum(HAIR_STYLES), hairColor: z.enum(HAIR_COLORS),
  shirtColor: z.enum(SHIRT_COLORS), pantsColor: z.enum(PANTS_COLORS), accessory: z.enum(ACCESSORIES),
});
export type Appearance = z.infer<typeof AppearanceSchema>;
export type HairStyle = Appearance["hairStyle"];
export type Accessory = Appearance["accessory"];

export const ROLES = ["player", "admin", "creator"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;
export const PERMISSIONS = ["admin.open"] as const;
export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  player: [], admin: ["admin.open"], creator: PERMISSIONS,
};
export function permissionsFor(role: Role): Permission[] { return [...ROLE_PERMISSIONS[role]]; }
export const ROLE_LABELS: Record<Role, string> = { player: "Player", admin: "Admin", creator: "Creator" };

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,14}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export function isValidUsername(username: string): boolean;
export function isValidPassword(password: string): boolean;

export const ProfileSchema = z.object({
  username: z.string(), role: RoleSchema, permissions: z.array(PermissionSchema),
  appearance: AppearanceSchema.nullable(),
  pointsScored: z.number().int().nonnegative(), gamesPlayed: z.number().int().nonnegative(),
  gamesWon: z.number().int().nonnegative(),
  createdAt: z.number().int(), lastLoginAt: z.number().int().nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const AccountErrorCodeSchema = z.enum([
  "INVALID_USERNAME", "INVALID_PASSWORD", "USERNAME_TAKEN", "BAD_CREDENTIALS",
  "WRONG_PASSWORD", "RATE_LIMITED", "NOT_LOGGED_IN", "BUSY",
]);
export type AccountErrorCode = z.infer<typeof AccountErrorCodeSchema>;
```

`messages.ts` changes:
- `YouViewSchema` and `OpponentViewSchema` each gain `appearance: AppearanceSchema.nullable()`. Export `YouView` and `OpponentView` types.
- `HelloSchema` gains `loginToken: z.string().optional()`.
- New client messages, added to `ClientMessageSchema`:
  - `accountRegister { username: z.string().max(64), password: z.string().max(256) }`
  - `accountLogin { username: z.string().max(64), password: z.string().max(256) }`
  - `accountLogout {}`
  - `accountChangePassword { currentPassword: z.string().max(256), newPassword: z.string().max(256) }`
  - `appearanceSet { appearance: AppearanceSchema }`
  - `profileRequest {}`
  The string limits are loose on purpose. The server applies the real rules so it can answer with a specific `accountError` code instead of a generic `BAD_MESSAGE`.
- New server messages, added to `ServerMessageSchema`:
  - `accountLoggedIn { profile: ProfileSchema, loginToken: z.string().optional() }`
  - `accountLoggedOut { reason: z.enum(["requested", "expired"]) }`
  - `accountError { code: AccountErrorCodeSchema, message: z.string() }`
  - `profile { profile: ProfileSchema }`
  - `passwordChanged {}`
- `version.ts`: `PROTOCOL_VERSION = 3`, with a comment line describing v3 (accounts, appearance on the board).
- `index.ts` re-exports everything from `accounts.ts`.

- [ ] Write failing tests in `packages/protocol/test/accounts.test.ts`:
  - `isValidUsername`: accepts `Bain`, `a_b-c`, 3- and 14-character names. Rejects 2 and 15 characters, spaces, `@`, the empty string.
  - `isValidPassword`: accepts 8 and 128 characters. Rejects 7 and 129.
  - `permissionsFor("creator")` equals every entry of `PERMISSIONS`. `permissionsFor("player")` is empty. `permissionsFor("admin")` contains `admin.open`.
  - `AppearanceSchema` accepts a valid look and rejects a color that is not in the list (`#000000`).
- [ ] Extend `packages/protocol/test/messages.test.ts`: each new client and server message parses. `roomState` without `appearance` fails. `roomState` with `appearance: null` parses. `hello` with `loginToken` parses.
- [ ] Run `npx vitest run packages/protocol` and see the new tests fail.
- [ ] Implement. Fix every existing test and fixture that builds a `roomState` so it includes `appearance`. Task 3 fixes the server compile errors from the new fields. Server tests already import `PROTOCOL_VERSION`, so the version bump needs no change there.
- [ ] `npx vitest run packages/protocol` passes. `npx tsc -b packages/protocol` passes.
- [ ] Update `packages/server/PROTOCOL.md` with every new message and field, and the resume sequence (spec §9).
- [ ] Commit: `feat(protocol): v3: accounts, profiles, roles, and appearance on the board`.

Note: the server will not typecheck after this task, because `viewFor` and the room do not yet send `appearance`. That is expected. Task 3 closes it. Report the exact server compile errors in the report file.

---

### Task 2: Accounts module and database

**Files:**
- Modify: `packages/server/package.json` (add `better-sqlite3` ^13.0.3. Add its types if the package does not ship them)
- Modify: `packages/server/src/config.ts` (add `databasePath`), `packages/server/test/config.test.ts`
- Modify: root `.gitignore` (add `data/`)
- Create: `packages/server/src/accounts/database.ts`, `passwords.ts`, `accountStore.ts`, `loginGuard.ts`, `seedAccounts.ts`
- Test: `packages/server/test/passwords.test.ts`, `accountStore.test.ts`, `loginGuard.test.ts`, `seedAccounts.test.ts`

**Interfaces (produces):**

```ts
// config.ts
databasePath: string;   // env DATABASE_PATH, default "data/eatio.sqlite"

// database.ts
import Database from "better-sqlite3";
export type AccountsDatabase = Database.Database;
/** Opens (creating parent directories for a file path), sets journal_mode=WAL and
 *  foreign_keys=ON, runs migrations tracked by PRAGMA user_version. ":memory:" for tests. */
export function openAccountsDatabase(path: string): AccountsDatabase;

// passwords.ts  (scryptSync N=16384, r=8, p=1, keylen 64, 16-byte random salt)
export function hashPassword(password: string): string;   // "scrypt$16384$8$1$<salt b64>$<hash b64>"
export function verifyPassword(password: string, stored: string): boolean;  // timingSafeEqual; false on a malformed stored value

// loginGuard.ts
export class LoginGuard {
  constructor(clock: Clock, limit?: number /* 5 */, windowMs?: number /* 60_000 */);
  isBlocked(): boolean;
  recordFailure(): void;
}

// accountStore.ts
export interface AccountRecord {
  id: number; username: string; role: Role; appearance: Appearance | null;
  pointsScored: number; gamesPlayed: number; gamesWon: number;
  createdAt: number; lastLoginAt: number | null;
}
export type RegisterResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; code: "INVALID_USERNAME" | "INVALID_PASSWORD" | "USERNAME_TAKEN" };
export interface GameRecord { accountId: number; score: number; won: boolean }

export class AccountStore {
  constructor(database: AccountsDatabase, clock: Clock);
  register(username: string, password: string, role?: Role): RegisterResult;
  verifyLogin(username: string, password: string): AccountRecord | null;
  recordLogin(accountId: number): AccountRecord;           // sets last_login_at = clock.now()
  createLoginToken(accountId: number): string;             // raw hex token; stores sha256
  resumeLoginToken(token: string): AccountRecord | null;   // null for unknown or expired (and deletes the expired row)
  deleteLoginToken(token: string): void;
  deleteOtherLoginTokens(accountId: number, keepToken: string | null): void;
  sweepExpiredTokens(): number;
  changePassword(accountId: number, currentPassword: string, newPassword: string): "ok" | "WRONG_PASSWORD" | "INVALID_PASSWORD";
  saveAppearance(accountId: number, appearance: Appearance): void;
  recordGames(records: GameRecord[]): void;                // one transaction
  get(accountId: number): AccountRecord | null;
  findByUsername(username: string): AccountRecord | null;  // case-insensitive
  setRole(accountId: number, role: Role): void;
  profileOf(account: AccountRecord): Profile;              // adds permissionsFor(role)
}

// seedAccounts.ts
export interface SeedEntry { username: string; role: Role }
export const SEED_ACCOUNTS: readonly SeedEntry[];  // Bain creator; Noah, Ruby, Mindi admin
export interface SeedOutcome { username: string; role: Role; created: boolean; generatedPassword: string | null }
/** For each entry: an existing account only gets its role set; a missing one is created
 *  with the password from choosePassword, or a generated 16-character one when it returns null. */
export async function seedAccounts(
  store: AccountStore,
  entries: readonly SeedEntry[],
  choosePassword: (username: string) => Promise<string | null>,
  generatePassword?: () => string,
): Promise<SeedOutcome[]>;
export function generatePassword(): string;  // 16 chars from [A-Za-z0-9], crypto random
```

Schema (migration 1), per spec §4:

```sql
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
```

Stored appearance JSON that fails `AppearanceSchema` on read becomes `null`.

- [ ] Write failing tests. Use `openAccountsDatabase(":memory:")` and `manualTime()` from `src/lobby/timers.ts` for the clock.
  - passwords: round trip. A wrong password fails. Two hashes of the same password differ. A malformed stored value returns false.
  - loginGuard: 4 failures not blocked. The 5th blocks. Blocked until 60 000 ms after the first failure in the window, then unblocked.
  - accountStore: register then `findByUsername("BAIN")` finds `Bain`. A duplicate in other capitals gives `USERNAME_TAKEN`. Bad usernames and passwords give their codes. `verifyLogin` with the right and wrong password. `recordLogin` sets `lastLoginAt` to the clock. A token resumes. After advancing the clock past 30 days it returns null and the row is gone. `deleteOtherLoginTokens` keeps only the named token. `changePassword` ok, `WRONG_PASSWORD`, `INVALID_PASSWORD`. `saveAppearance` round trip. `recordGames` with a win, a loss (score 0 allowed), and a draw (`won: false`) updates all three counters. Inserting role `'boss'` directly with SQL throws. `profileOf` for a creator lists `admin.open`.
  - seedAccounts: a first run creates all four with the right roles and reports generated passwords where `choosePassword` returned null. A second run creates nothing and leaves password hashes unchanged. An existing `player` account named `noah` is promoted to `admin`.
  - config: `DATABASE_PATH` default and override.
- [ ] Run them and see them fail.
- [ ] Implement. `npm install` from the repo root after adding the dependency.
- [ ] `npx vitest run packages/server/test/passwords.test.ts packages/server/test/accountStore.test.ts packages/server/test/loginGuard.test.ts packages/server/test/seedAccounts.test.ts packages/server/test/config.test.ts` passes.
- [ ] Commit: `feat(server): accounts module: SQLite store, scrypt passwords, login tokens, seed list`.

---

### Task 3: Lobby, room, and matchmaker integration

**Files:**
- Modify: `packages/server/src/session/session.ts`, `src/lobby/lobby.ts`, `src/lobby/room.ts`, `src/lobby/matchmaking.ts`, `src/engine/engine.ts` (return type of `viewFor` only), `src/index.ts`
- Modify the tests that construct `Lobby` or `Room`, to add the new deps. Examples: `lobby.test.ts`, `reconnect.test.ts`, `playAgain.test.ts`, `room.test.ts`, `roomSafety.test.ts`, `shutdown.test.ts`, `e2e.test.ts`, `viewFor.test.ts`
- Test: `packages/server/test/accounts.lobby.test.ts` (new), `matchmaking.test.ts`

**Interfaces:**
- Consumes Task 1 messages and Task 2 `AccountStore`, `LoginGuard`, `openAccountsDatabase`.
- `Session` gains `accountId: number | null`, `appearance: Appearance | null`, `loginToken: string | null`, `readonly loginGuard: LoginGuard` (constructed with the lobby clock).
- `LobbyDeps` gains `accounts: AccountStore`.
- `Matchmaker.joinPublic(playerId, canPairWith?: (other: PlayerId) => boolean)` skips waiting players the predicate rejects. `Matchmaker.joinPrivate(playerId, code, canPairWith?)` answers `{ ok: false, reason: "cannot join your own room" }` when the predicate rejects the host, and keeps the code. `Matchmaker.isWaiting(playerId): boolean` is true while in the public queue or holding a private code.
- Engine: `viewFor` returns a new exported type `GameView` (the room state with `appearance` absent from `you` and `opponent`). No other engine change.
- `RoomDeps` gains `onResult: (results: { playerId: PlayerId. Score: number. Kind: ResultKind }[]) => void`, called in `finish()` before `onFinished`, never in `abandon()`.
- `Room.addPlayer(playerId, name, appearance: Appearance | null)`. `broadcast` and `finish` send `viewFor(...)` with `appearance` added to `you` and `opponent` from the seats.

**Lobby behavior** (spec §5, §6, §9):
- `hello` with `loginToken`: if a `sessionToken` reclaims an existing session, keep that session's account. For a new session: `resumeLoginToken(token)`. Valid → attach the account (`accountId`, `appearance`, `loginToken = token`, `name = username`), `recordLogin`, send `welcome` then `accountLoggedIn { profile }` with no `loginToken`. Invalid → send `welcome` then `accountLoggedOut { reason: "expired" }`.
- `accountRegister`, `accountLogin`: `BUSY` when `matchmaker.isWaiting` or seated in a room. `RATE_LIMITED` when the session's guard is blocked. Register: `store.register`. On failure send `accountError` with its code. Login: `verifyLogin`. Null → `loginGuard.recordFailure()` and `BAD_CREDENTIALS` ("Wrong username or password."). On success: `recordLogin`, `createLoginToken`, attach, send `accountLoggedIn { profile, loginToken }`. A new account with no saved appearance but a session appearance (guest `appearanceSet`) gets that appearance saved.
- `accountLogout`: `BUSY` rules as above. `NOT_LOGGED_IN` for a guest. Otherwise `deleteLoginToken(session.loginToken)`, clear the account fields (keep `session.appearance`), and send `accountLoggedOut { reason: "requested" }`.
- `accountChangePassword`: `NOT_LOGGED_IN` for a guest. `RATE_LIMITED` when blocked. `WRONG_PASSWORD` records a guard failure. On `ok`: `deleteOtherLoginTokens(accountId, session.loginToken)`, send `passwordChanged`.
- `appearanceSet`: set `session.appearance`. If logged in, `saveAppearance`. No reply.
- `profileRequest`: `NOT_LOGGED_IN` for a guest, else `profile { profile }` from a fresh `store.get`.
- Queue and private join pass `canPairWith = (other) => !sameAccount(playerId, other)`, where two sessions are the same account when both have the same non-null `accountId`.
- `startRoom` passes each session's current appearance to `addPlayer`, and records each seat's `accountId` for the room. `onResult` calls `recordGames` for the logged-in seats (`won: kind === "win"`), then sends each of those sessions `profile { profile }`.
- `index.ts`: open the database at `config.databasePath`, sweep expired tokens, build `new AccountStore(database, systemClock)`, pass it to the lobby. Closing the transport also closes the database.

- [ ] Write failing tests in `accounts.lobby.test.ts` with a lobby built on `openAccountsDatabase(":memory:")` and `manualTime()`. One test each:
  - register → `accountLoggedIn` with a `loginToken` and the username as the profile username. The session name becomes the username.
  - login with the wrong password → `BAD_CREDENTIALS`. Five failures → the sixth attempt gets `RATE_LIMITED` even with the right password. After advancing 60 000 ms the right password works.
  - register while queued → `BUSY`.
  - hello with a valid token → `welcome` then `accountLoggedIn` without `loginToken`, and `lastLoginAt` updated.
  - hello with an unknown token → `welcome` then `accountLoggedOut { reason: "expired" }`, and the guest can still queue.
  - a logged-in session reconnecting with its `sessionToken` stays logged in (a `profileRequest` returns its profile).
  - two sessions of one account both queue → no room starts. A third session (another account or a guest) pairs with the first.
  - a private room created by an account cannot be joined by another session of the same account. The code still works for someone else.
  - A finished game records played, won, and points for logged-in seats, and each gets a `profile` message. A guest seat records nothing. Play the game out with the manual clock and auto moves, as the `fullGame` and `e2e` tests do.
  - an abandoned room (one player sends `roomLeave`) records nothing.
  - `appearanceSet` from both players before queueing → each `roomState` carries the player's own look in `you.appearance` and the opponent's in `opponent.appearance`. A player who never set one shows `null`.
  - change password → `passwordChanged`. The session's own token still resumes, another token for the account no longer does.
  - logout → `accountLoggedOut { reason: "requested" }`. The token no longer resumes.
- [ ] Extend `matchmaking.test.ts` for `canPairWith` and `isWaiting`.
- [ ] Run and see them fail.
- [ ] Implement. Update every existing test that builds a `Lobby` or `Room` (an in-memory store. `onResult: () => {}`. `addPlayer(..., null)`). Existing tests must keep their assertions.
- [ ] `npm test` and `npm run typecheck` pass from the repo root The client can still fail the typecheck on the new `appearance` fields. In that case, put the errors in the report and leave the client for Task 5.
- [ ] Commit: `feat(server): accounts in the lobby: login, resume, stats, appearance on the board, no self-matches`.

---

### Task 4: Seed command

**Files:**
- Create: `packages/server/scripts/seed-accounts.ts`
- Modify: root `package.json` (add script `"accounts:seed": "tsx packages/server/scripts/seed-accounts.ts"`)

**Behavior:** Reads `DATABASE_PATH` through `loadConfig()`, or a `--database <path>` argument that wins over it. Opens the database and runs `seedAccounts(store, SEED_ACCOUNTS, prompt)`. The prompt asks `Password for <username> (Enter to generate one): ` with the typed characters hidden (readline with output muted while typing), and returns null for an empty answer. It prints one line per account: `created <username> (<role>), password: <generated>` for a generated password, `created <username> (<role>)` for a typed one, and `updated <username> → <role>` for an existing account. It closes the database. It exits non-zero with a message if stdin is not a terminal and an account needs a password.

- [ ] Implement.
- [ ] Try it by hand, with no prompt needed:
  1. Point `DATABASE_PATH` at a file in a new temporary folder.
  2. Create the four seed accounts in that file with a short `npx tsx -e` script that calls `AccountStore.register`.
  3. Run `npm run accounts:seed`. Expect four `updated` lines, because every account exists.
  4. Run it again with an empty database and stdin from `/dev/null`. Expect the non-terminal error and a non-zero exit.
- [ ] Commit: `feat(server): npm run accounts:seed to create or promote the seed accounts`.

---

### Task 5: Client state and connection

**Files:**
- Modify: `packages/client-3d/src/appearance/appearance.ts` (import the option lists, `Appearance`, `HairStyle`, `Accessory` from `@eat.io/protocol` and re-export them. Keep `DEFAULT_APPEARANCE`, `randomAppearance`, `appearanceFromName`)
- Modify: `src/state/gameState.ts`, `src/state/gameReducer.ts`, `src/state/GameProvider.tsx`, `src/connection/useConnection.ts`, `src/state/LocalState.tsx`, `src/config.ts`
- Create: `src/state/loginStorage.ts`
- Test: `packages/client-3d/test/gameReducer.test.ts`, `test/loginStorage.test.ts`

**Interfaces:**
- `AppState` gains `account: Profile | null` and `accountError: { code: AccountErrorCode. Message: string. Seq: number } | null` and `accountNotice: { text: string. Seq: number } | null`.
- Reducer: `accountLoggedIn` → `account = profile`, clear `accountError`. `profile` → `account = profile`. `accountLoggedOut` → `account = null`. `accountError` → set it with an incremented `seq`. `passwordChanged` → `accountNotice = { text: "Password changed.", seq }`. `backToMenu` clears `account`, `accountError`, `accountNotice`. New local action `dismissAccountError`. The switch stays exhaustive.
- `loginStorage.ts`: `loadLoginToken(): string | null`, `saveLoginToken(token)`, `clearLoginToken()`, `loadServerUrl()`, `saveServerUrl(url)`. Keys `eatio.loginToken` and `eatio.serverUrl`. Every storage access is inside try/catch and degrades to no-op or null. Accept an optional `Storage`-like argument for tests.
- `useConnection.connect(url, name, loginToken?: string)`: `hello` carries `loginToken` when given, on every open (with `sessionToken` too, once one exists).
- `GameApi` gains: `connect(url, name, loginToken?)`, `connectAndRegister(url, username, password)`, `connectAndLogin(url, username, password)`, `register(username, password)`, `login(username, password)`, `logout()`, `changePassword(currentPassword, newPassword)`, `setAppearance(appearance)`, `requestProfile()`, `dismissAccountError()`. The `connectAnd…` calls connect with the username as the hello name. They hold the account message in a ref and send it right after `welcome`.
- `GameProvider`: on `accountLoggedIn` with a `loginToken`, `saveLoginToken`. On `accountLoggedOut`, `clearLoginToken`. On every `connect`, `saveServerUrl(url)`. On mount, if `loadLoginToken()` is set, connect to `loadServerUrl()` (when `serverIsConfigured()` is false) or `initialServerUrl()`, with hello name `"Player"` and the token.
- `LocalState`: when `identity` becomes set and `account` is null → `setAppearance(appearance)` to the server (guests share their look). When `account` changes from null to a profile → if `profile.appearance` is set, replace the local appearance. Else send the local appearance with `setAppearance`. `setCustomizing(false)` from the customize panel's Done sends the current look when connected. Add `profileOpen: boolean` and `setProfileOpen`. Opening one closes the other (`customizing` and `profileOpen` never both true). Entering a room closes both.

- [ ] Write failing reducer tests for each new message and action. Write `loginStorage` tests with a fake storage, and with a storage whose methods throw.
- [ ] Run and see them fail. Implement.
- [ ] `npm test` and `npm run typecheck` pass.
- [ ] Commit: `feat(client): account state, login token storage, auto-resume, and appearance sync`.

---

### Task 6: Client UI: menu, profile, and appearance on the table

**Files:**
- Modify: `src/ui/MenuPanel.tsx`, `src/ui/TopBar.tsx`, `src/App.tsx`, `src/scene/cameraShots.ts`, `src/scene/Stage.tsx`, `src/scene/game/GameTable.tsx`, `src/ui/CustomizePanel.tsx`, `src/ui/styles/interface.css`
- Create: `src/ui/ProfilePanel.tsx`, `src/ui/AccountForm.tsx`
- Test: `packages/client-3d/test/cameraShots.test.ts`

**Behavior** (spec §11):
- Menu, before connecting: three tabs: "Play as guest" (the current name field and Connect), "Log in", and "Create account". The account tabs have a username field (max 14), a password field (type password), and for Create account a second password field. Show the rules under the fields: "3–14 letters, numbers, _ or -" and "At least 8 characters". Submit stays disabled until `isValidUsername` and `isValidPassword` pass and the two passwords match. Show `accountError.message` under the form. Submitting calls `connectAndLogin` or `connectAndRegister`. The Server field shows under every tab when `serverIsConfigured()` is false.
- Menu, after connecting as a guest: keep Find a game, Create a private room, and Join with code. Add a line "Playing as a guest. Log in". It opens the Log in form in place, which calls `login` or `register` on the open connection.
- Top bar: a profile button left of the detail switch. Guest → "Log in" (opens the menu's Log in tab. In a game it is hidden). Logged in → the username with a small colored dot for the role, opening the profile panel. Hidden while `screen` is `game`.
- `ProfilePanel` is docked left and fades like the other panels. It shows the username and a role badge (`ROLE_LABELS`). It shows member since (`toLocaleDateString`) and last login (date and time, or "never"). It shows games played, games won, and win rate (0% with no games). It shows points scored and points per game (one decimal, 0 with no games). A "Change password" section has current, new, and repeat fields. Its submit stays disabled until the new password is valid and repeated. Success shows `accountNotice.text`. Errors show `accountError.message`. A Log out button (calls `logout`). A Close button. Opening it calls `requestProfile()`.
- Camera: `selectShot(screen, showingKid, portrait)`: rename the second parameter. It is true when customizing or when the profile is open. Update the tests: the profile uses the customize shot from the menu and the queue.
- `GameTable`: rename the `customizing` prop to `showingKid`. The opponent's kid uses `room.opponent.appearance ?? appearanceFromName(room.opponent.name)`.
- `CustomizePanel`: when logged in, the footnote reads "Saved to your account." instead of "Only you see this look…".

- [ ] Update `cameraShots.test.ts` for the rename and the profile case. See it fail. Implement the rename.
- [ ] Implement the UI.
- [ ] `npm test`, `npm run typecheck`, and `npm run build --workspace @eat.io/client-3d` pass.
- [ ] Commit: `feat(client): log in, create account, profile panel, and saved looks on the table`.

---

### Task 7: Build, deploy, and docs

**Files:**
- Modify: `scripts/build-server.mjs` (mark `better-sqlite3` external. Write it into the bundle `package.json` `dependencies` with the version from `packages/server/package.json`)
- Modify: `scripts/deploy-server.mjs` (unchanged upload set. Print a reminder that the database lives at `data/eatio.sqlite` on the host and is never uploaded by this script)
- Modify: `packages/server/README.md` (accounts, `DATABASE_PATH`, seeding, production seeding), root `README.md`, `packages/client-3d/README.md` (accounts UI, login token storage)

**Production seeding** (document it in `packages/server/README.md`): the host has no shell. Seed a fresh local file and upload it once, before the first player registers:

```bash
npm run accounts:seed -- --database /tmp/eatio-seed.sqlite
bonto files upload eatio data/eatio.sqlite /tmp/eatio-seed.sqlite
npm run deploy:server
```

- [ ] Implement. `npm run build:server` then run the bundle from an empty folder with `npm install --omit=dev` inside it, `PORT=8768 DATABASE_PATH=./data/test.sqlite npm start`, and confirm `curl` gets "ok" and `data/test.sqlite` exists.
- [ ] Commit: `build: ship better-sqlite3 with the server bundle. Document accounts and seeding`.
