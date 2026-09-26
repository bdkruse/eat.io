# eat.io Accounts, Roles, and Stats — Design Spec

**Date:** 2026-09-26
**Scope:** Player accounts in SQLite, with login over the existing WebSocket. Accounts save
appearance and stats and carry a role. The work adds a seed command and a profile UI in
`packages/client-3d`. Guest play stays as it is.

---

## 1. Intent

The owner wants players to create an account with only a username and password. There is
no email step. An account keeps the player's appearance, so they look the same the
next time they log in. The account also tracks points scored, games played, games won, the
last login date, and the creation date. A profile button in the client opens the profile.

Accounts have roles. The owner, "Bain", is the Creator and has every permission. "Noah",
"Ruby", and "Mindi" are Admins. Admins can open an admin UI that does not exist yet.

Success: a guest can still play with no account. A player can create an account, play,
close the browser, come back logged in, and see their saved look and updated stats.

## 2. Decisions

| Question | Decision |
|---|---|
| Database | SQLite through `better-sqlite3`, one file at `DATABASE_PATH` (default `./data/eatio.sqlite`) |
| Guests | Allowed. Guests have no saved look or stats |
| Opponent sees your look | Yes. The board update carries each player's appearance |
| Stay logged in | Yes. A login token is kept in the browser for 30 days |
| Roles | Player (default), Admin, Creator |
| Seeding | `npm run accounts:seed`, which prompts for each password or generates one |
| Change password | Yes, on the profile |

The host must give the server a persistent disk. Without one, the SQLite file and every
account disappear on redeploy.

## 3. Constraints carried over

The existing server rules still apply:

- The engine stays pure. Accounts, the database, and appearance never enter
  `packages/server/src/engine/`.
- There is no module-level mutable state. The database handle is opened in the composition
  root (`src/index.ts`) and passed down, like the clock and timers.
- The client computes no game state. Stats come from the server.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never
  "plate."

## 4. Data model

Migrations run at startup and are tracked with `PRAGMA user_version`.

**`accounts`**

| Column | Type | Notes |
|---|---|---|
| `id` | integer primary key | |
| `username` | text, unique, `COLLATE NOCASE` | As typed. Unique regardless of capitals |
| `password_hash` | text | `scrypt$N$r$p$salt$hash`, base64 parts |
| `role` | text, default `'player'` | Allowed values: `player`, `admin`, `creator` |
| `appearance` | text, nullable | JSON that matches the shared schema |
| `points_scored` | integer, default 0 | Total of the player's final scores |
| `games_played` | integer, default 0 | Finished games only |
| `games_won` | integer, default 0 | |
| `created_at` | integer | Epoch milliseconds |
| `last_login_at` | integer, nullable | Epoch milliseconds |

**`login_tokens`**

| Column | Type | Notes |
|---|---|---|
| `token_hash` | text primary key | SHA-256 of the token. The raw token is never stored |
| `account_id` | integer | References `accounts.id`, cascade on delete |
| `created_at` | integer | |
| `expires_at` | integer | `created_at` plus 30 days |

The server deletes an expired token at its next use, and sweeps all expired tokens at startup.

## 5. Accounts

**Usernames.** 3 to 14 characters: letters, digits, `_`, and `-`. The limit of 14 matches
the existing name limit.

**Passwords.** 8 to 128 characters. They are hashed with `scrypt` from `node:crypto`, with
a random 16-byte salt. Comparisons use `timingSafeEqual`.

**Logging in.** A successful registration, login, or token resume sets `last_login_at` to
the injected clock's time. Registration and login create a new login token. A resume keeps
the token it came with.

**Brute-force guard.** After 5 failed logins on one connection within 60 seconds, the
connection gets `RATE_LIMITED`. The block lasts for the rest of that 60-second window. The same guard covers wrong current
passwords in a password change.

**Change password.** The player gives the current password and a new one. On success, every
other login token for the account is deleted, so other devices must log in again. The
current device stays logged in.

**One account, two tabs.** An account can be logged in on more than one connection. It is
never matched against itself. The public queue skips a pairing between two sessions of the
same account. The server refuses a private room join from the account that created it.

**Busy.** In a queue, with a private room code, or seated in a room, a session cannot
register, log in, or log out. The server answers `BUSY`. This keeps a player's name and
identity fixed for a whole game.

**Display name.** A logged-in player's display name is their username. A guest's display
name is the name sent in `hello`, as today.

## 6. Stats

When a room finishes with a result, the lobby records each logged-in player's game in one
transaction:

- `games_played` plus 1.
- `games_won` plus 1 for a win. A draw adds nothing here.
- `points_scored` plus that player's final score.

An abandoned room records nothing, which matches the existing "No result is recorded"
message. After recording, the server sends each logged-in player their updated profile.

The room reports results through a callback. It never touches the database.

## 7. Roles and permissions

Roles and permissions are data in `@eat.io/protocol`, so the server and the client share
one list.

```ts
PERMISSIONS = ["admin.open"]              // grows as the admin UI is built
ROLE_PERMISSIONS = {
  player: [],
  admin: ["admin.open"],
  creator: PERMISSIONS,                   // every permission, including future ones
}
```

The server is the authority on permissions. The client uses them only to decide what to
show. No feature uses `admin.open` yet. The profile shows the role as "Player", "Admin",
or "Creator". Opponents never see roles. Changing a role is not part of this work. It
belongs in the future admin UI.

## 8. Seeding

The seed list is committed in `packages/server/src/accounts/seedAccounts.ts`. It holds
usernames and roles only, never passwords:

| Username | Role |
|---|---|
| Bain | creator |
| Noah | admin |
| Ruby | admin |
| Mindi | admin |

`npm run accounts:seed` opens the database at `DATABASE_PATH` and goes through the list.
For an account that does not exist, it asks for a password with hidden input. Pressing
Enter generates a random 16-character password instead, which is printed once. For an
account that exists, the command sets the role and leaves the password alone. Running it
again changes nothing.

## 9. Protocol (version 2 to 3)

**Shared shapes**

- `Appearance`: the option lists move from the client into the protocol package. A color
  must be one of the listed colors, not any hex string.
- `Profile`: `username`, `role`, `permissions`, `appearance` (nullable), `pointsScored`,
  `gamesPlayed`, `gamesWon`, `createdAt`, `lastLoginAt`.

**Client to server**

| Message | Fields |
|---|---|
| `hello` | adds optional `loginToken` |
| `accountRegister` | `username`, `password` |
| `accountLogin` | `username`, `password` |
| `accountLogout` | none |
| `accountChangePassword` | `currentPassword`, `newPassword` |
| `appearanceSet` | `appearance` |
| `profileRequest` | none |

**Server to client**

| Message | Fields |
|---|---|
| `accountLoggedIn` | `profile`, and `loginToken` for a new login (absent on a resume) |
| `accountLoggedOut` | `reason`: `requested` or `expired` |
| `accountError` | `code`, `message` |
| `profile` | `profile` |
| `passwordChanged` | none |
| `roomState` | `you` and `opponent` each gain `appearance` (nullable) |

`accountError` codes: `INVALID_USERNAME`, `INVALID_PASSWORD`, `USERNAME_TAKEN`,
`BAD_CREDENTIALS`, `WRONG_PASSWORD`, `RATE_LIMITED`, `NOT_LOGGED_IN`, `BUSY`.
`BAD_CREDENTIALS` never says which part was wrong.

**Resume.** `hello` with a valid `loginToken` answers `welcome`, then `accountLoggedIn`.
With an unknown or expired token, it answers `welcome`, then `accountLoggedOut` with reason
`expired`, and the session continues as a guest.

**Appearance on the board.** For a logged-in session, the appearance comes from the account.
For a guest, it comes from the last `appearanceSet`. From a logged-in session,
`appearanceSet` also saves to the account. At the start of a room, the room copies each
player's appearance. `null` means the player never set one. The engine's `viewFor` keeps
producing the game view, and the room adds the two appearances to it.

## 10. Server layout

```
packages/server/src/accounts/
  database.ts        open the file, run migrations, sweep expired tokens
  passwords.ts       scrypt hash and verify
  accountStore.ts    register, verify, tokens, record a game, appearance, role
  loginGuard.ts      per-connection failed-attempt window
  seedAccounts.ts    the seed list
packages/server/scripts/
  seed-accounts.ts   the prompt-driven seed command
```

The lobby receives an `AccountStore` dependency. Tests pass a store backed by an in-memory
database (`:memory:`).

## 11. Client

**Menu.** Three tabs: Play as guest, Log in, and Create account. Log in and Create account
take a username and password. Connecting happens on submit, as today.

**Staying logged in.** The login token is stored in `localStorage` under `eatio.loginToken`,
with every access wrapped in try/catch. On load, a stored token starts a connection and a
resume. The last server address used is stored too, so development on a non-default port
still resumes. If resume fails, the menu shows as usual.

**Profile button.** It sits in the top bar. For a guest it reads "Log in" and opens the Log
in tab. When logged in, it shows the username and opens the profile panel:

- Username and role badge.
- Member since, last login.
- Games played, games won, win rate.
- Points scored, points per game.
- Change password: current password, new password, and the new password again.
- Log out.

While the profile is open, the camera uses the customize shot so the player's kid is in
view.

**Appearance.**

- A guest sends `appearanceSet` right after connecting, and again at each press of Done on
  the customize screen.
- Logging in replaces the local look with the account's saved look. If the account has
  none, which is always the case for a new account, the local look is saved to it.
- For a logged-in player, Done saves to the account.
- The opponent's kid uses `roomState.opponent.appearance`. If that is null, the look
  generated from the name is used, as today.

**State.** The reducer gains `account` (a `Profile` or null) and `accountError`. Storing the
token is a side effect in a hook that watches state. The reducer stays pure.

## 12. Testing

- Passwords: hash and verify, wrong password fails, the stored format parses.
- Account store with `:memory:`:
  - Register, and duplicate usernames regardless of capitals.
  - Password match, and token create, resume, expiry, and deletion.
  - Recording a win, a loss, and a draw.
  - Appearance round trip, and the allowed role values.
  - Seeding that changes nothing on a second run.
- Lobby:
  - Register and login flows, `BAD_CREDENTIALS`, `RATE_LIMITED`, and `BUSY`.
  - Resume with a good token and with a bad one.
  - Stats recorded for a finished game, and nothing recorded for an abandoned one.
  - The profile pushed at the end of a game, and appearance reaching the opponent.
  - No self-match in the queue or through a private room, and guests unaffected.
- Protocol: the new schemas accept good messages and reject bad ones.
- Client reducer: each new message.
- By hand in two browsers: create an account, customize, play, reload, and see the look and
  stats persist. Also change the password and log out.

## 13. Out of scope

Email, password reset by email, deleting an account, the admin UI, changing roles, a
leaderboard, and login from more than one server process.
