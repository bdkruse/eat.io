# @eat.io/server

The authoritative WebSocket game server for **eat.io** — a two-player game where trays of
food advance down a table, get eaten at the end, and score. The server owns all state and
rules; clients only render.

## Stack, and why

- **Node 22 + TypeScript (strict, ESM).** Strict types are non-negotiable — the previous
  prototype's untyped module-level globals are why it rotted.
- **`ws`** for WebSocket — small and battle-tested; no framework.
- **`zod`** for runtime validation, with the schemas as the **single source of truth** for
  the TypeScript message types (`z.infer`). The wire format and the types cannot drift.
- **`vitest`** for tests, **`tsx`** to run TypeScript directly.

Dependencies are kept minimal by design.

## Run it

```bash
npm install          # from the repo root
npm start            # runs the server via tsx
npm run dev          # same, with reload on change
npm test             # full test suite
npm run typecheck    # tsc project build (strict)
```

Configuration is environment-driven (all optional; defaults shown):

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | WebSocket port |
| `ROUND_COUNT` | `20` | First-run default for the round count |
| `MOVE_DEADLINE_MS` | `20000` | First-run default for the turn clock, in milliseconds |
| `RECONNECT_GRACE_MS` | `30000` | Grace window to reconnect after a drop |
| `HEARTBEAT_INTERVAL_MS` | `15000` | Ping cadence |
| `HEARTBEAT_TIMEOUT_MS` | `10000` | Missed-pong → connection dropped |
| `TABLE_LENGTH` | `5` | Trays per table |
| `HAND_SIZE` | `5` | First-run default for the hand size |
| `RNG_SEED` | random | Fix for reproducible games |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `DATABASE_PATH` | `data/eatio.sqlite` | Accounts database file, relative to the working directory (`:memory:` for a throwaway one) |

`ROUND_COUNT`, `MOVE_DEADLINE_MS`, and `HAND_SIZE` only seed the game settings on a fresh
database. After that the settings live in the database, and a change to these variables
does nothing. Change them in the Admin panel instead. See
[Game settings and the default deck](#game-settings-and-the-default-deck).

## Accounts

Player accounts are backed by SQLite (`better-sqlite3`). The database opens from
`DATABASE_PATH` and migrates automatically on startup. See [Migrations](#migrations).

A username is 3 to 14 letters, numbers, `_`, or `-`. Usernames are unique regardless of
capitalization. A password is 8 to 128 characters.

A successful login or registration returns a login token. The client stores that token for
30 days and sends it back on `hello` to resume the account. See
[`PROTOCOL.md`](./PROTOCOL.md) for the wire format.

Roles are `player` (default), `admin`, and `creator`. Each role has a set of permissions,
defined in `@eat.io/protocol`:

| Permission | What it allows | Roles |
|---|---|---|
| `admin.open` | Reserved for the admin tools. Nothing uses it yet | `admin`, `creator` |
| `settings.edit` | Read and save the game settings | `admin`, `creator` |
| `deck.edit` | Read and save the default deck | `creator` |
| `shop.edit` | Read and save shop prices and availability | `creator` |

A `player` has no permissions. The server reads the role from the database on every
request and save, so a demotion takes effect on the next one. A refused request answers
`adminError` `FORBIDDEN`. A guest with no account can still play, using only a display
name and a session token. A guest has no permissions.

Per-account stats are recorded only for games that finish: points scored, games played,
games won, the created date, and the last login date. Lunch Money is added in the same
transaction. See [Lunch Money and the shop](#lunch-money-and-the-shop).

### Seeding accounts

```bash
npm run accounts:seed                          # against DATABASE_PATH
npm run accounts:seed -- --database ./path.sqlite   # against a specific file
```

This creates or promotes the seed accounts: Bain as `creator`, and Noah, Ruby, Mindi, and
Clint as `admin`. It prompts for a hidden password for each new account. Press Enter
instead to generate one. The generated password prints once. No passwords live in the
repo. An account that already exists only has its role brought in line.

### Production seeding

The Bonto host has no shell. Seed a fresh local file first, then upload it once before the
first player registers:

```bash
npm run accounts:seed -- --database /tmp/eatio-seed.sqlite
bonto files upload eatio data/eatio.sqlite /tmp/eatio-seed.sqlite
npm run deploy:server
```

After go-live, running that upload again replaces the whole host database file. It deletes
every account, stat, Lunch Money balance, purchase, and saved setting created since, not
just the seed accounts. To add or promote an account later without losing real accounts,
ask the owner for a controlled change instead of re-uploading. There is no in-app admin tool for this yet.

### Migrations

Migrations run automatically at startup, in order, and each runs once. `PRAGMA
user_version` records how many have run. A migration that fails rolls back, and the
server does not start.

| Migration | What it adds |
|---|---|
| 1 | The `accounts` and `login_tokens` tables |
| 2 | `game_settings` (one row), `default_deck` (copies per card, 0 to 40), and `default_deck_meta` (who saved the deck, and when). It never touches accounts |
| 3 | `accounts.lunch_money`, backfilled from `points_scored`. The `owned_items` table (which account owns which shop item, and the purchase time). `shop_items` (the Creator's price and availability) and `shop_items_meta` (who saved them, and when) |

## Game settings and the default deck

Three game settings and the default deck live in the database. Admins and the Creator
edit the settings, and the Creator edits the deck, in panels in the game. No restart is
needed.

| Setting | Range | Edited by |
|---|---|---|
| Round count | 1 to 30 | Admin, Creator |
| Turn clock | 5 to 120 seconds | Admin, Creator |
| Hand size | 3 to 8 cards | Admin, Creator |
| Copies of one card in the default deck | 0 to 40 | Creator |
| Default deck total | 10 to 100 cards | Creator |

All values are whole numbers. The limits live in `@eat.io/protocol`, so the server and
the panels use the same numbers. The server refuses a save outside a limit, or a deck
with an unknown card, with `adminError` `INVALID_SETTINGS` or `INVALID_DECK`. The message
names the problem.

When the turn clock runs out, a player who has not ended the turn discards a random card.

On a fresh database, the server seeds the settings from `ROUND_COUNT`,
`MOVE_DEADLINE_MS` (rounded to seconds), and `HAND_SIZE`. It seeds the deck with the
starting deck only while the deck table is empty. The seed never replaces a saved value,
and it never adds to a deck that is already there. So a card added to the catalog later
starts at 0 copies until the Creator gives it some.

Each room reads the settings and the deck once, at its start, and keeps them for the
whole game. A save changes only games that start after it. When the deck runs out
mid-game, the room rebuilds it from the same composition. A catalog card missing from
the stored deck counts as 0 copies. A stored card that is not in the catalog is ignored.
If the stored deck has fewer than 10 catalog cards, the room uses the starting deck and
logs a warning.

Each save records who made it and when. The panels show this as "Last changed by".

## Lunch Money and the shop

A logged-in player earns Lunch Money in a finished game, one for each point scored. A
guest earns nothing. Migration 3 gave each existing account Lunch Money equal to the
points it had scored so far.

The shop sells cosmetics. The catalog is `SHOP_ITEMS` in `@eat.io/protocol`
(`src/shop.ts`), defined in code like the cards. Each item has an id, a name, a kind, the
appearance value it unlocks, and a default price.

| Kind | Items (default price) |
|---|---|
| Extra | Sunglasses (30), Bow Tie (30), Headphones (40), Chef Hat (50), Crown (100), Propeller Cap (60), Traffic Cone Hat (70), Viking Helmet (80), Alien Antennae (60), Banana Hat (90) |
| Shirt color | Gold Shirt (100), Neon Lime Shirt (40), Midnight Shirt (30) |
| Hair color | Electric Blue Hair (50), Bubblegum Pink Hair (50), Silver Hair (40) |
| Eye shape | Star Eyes (60), Heart Eyes (60) |
| Eye color | Violet (40), Glowing Gold (80) |
| Mouth shape | Tongue Out (50), Vampire Fangs (70) |

The Creator sets each item's price (a whole number from 1 to 1000) and whether it is
available. An item with no saved row uses its default price and is available. A save that
lists only some items leaves the others as they were.

- **Buying:** one database transaction. The server makes sure that you are logged in, the item
  is available, you do not own it, and you can afford it. Then it takes the price and
  records the item as yours. A failed buy answers `accountError` with `NOT_LOGGED_IN`,
  `NOT_AVAILABLE`, `ALREADY_OWNED`, or `NOT_ENOUGH`. Nothing is refunded or sold back.
- **Turned off:** an item the Creator turns off leaves the shop. Players who own it keep
  it and can still wear it.
- **Free looks:** everything that was free before the shop is still free.

### Looks

A look has nine fields: skin tone, hair style, hair color, shirt color, pants color, one
extra, eye shape, eye color, and mouth shape. The option lists are in `@eat.io/protocol`
(`src/accounts.ts`), free values first.

| Face option | Free values | Shop values |
|---|---|---|
| Eye shape | Round (default), Almond, Sleepy, Sparkly | Star Eyes, Heart Eyes |
| Eye color | Dark Brown (default), Brown, Hazel, Green, Blue, Gray | Violet, Glowing Gold |
| Mouth shape | Smile (default), Big Grin, Calm, Smirk | Tongue Out, Vampire Fangs |

A look saved before the face fields existed still reads, as Round eyes, Dark Brown, and a
Smile.

The server refuses an `appearanceSet` that uses a shop item the player does not own, with
`accountError` `NOT_OWNED`. A guest owns nothing, so a guest cannot wear shop items. On
logout the server takes the shop items off the session's look. When a room starts, it
takes off any item the player does not own before the room keeps the look.

## Architecture

Four layers; dependencies point downward only.

- **Transport** (`src/transport/`) — the `ws` server: accepts sockets, decodes and
  schema-validates every frame, runs heartbeats, and routes to the lobby. A bad message or
  a thrown handler never crashes the process.
- **Session** (`src/session/`) — one connected client: identity, a reconnection token, and a
  send that no-ops while detached (the socket is swapped on reconnect).
- **Lobby / Room** (`src/lobby/`) — the coordinator, matchmaker (public queue + single-use
  four-digit private codes), room registry with reaping, and the `Room` turn loop (submit → resolve, the turn
  clock, disconnect/pause/reconnect/abandon, broadcast via per-player projection).
- **Game engine** (`src/engine/`) — **pure**: `(state, action) → state`. No sockets, no
  timers, no globals; clock and RNG are injected. A full game runs in a plain loop
  (`test/fullGame.test.ts`).

The protocol lives in the sibling package **`@eat.io/protocol`** and is documented in
[`PROTOCOL.md`](./PROTOCOL.md).

## Where the rules live

All game content is data in **`src/engine/rules/content.ts`**: the card catalog, the
starting deck, and tuning (table length, tray value band). The engine applies effects by
dispatch over `card.action`, so adding a card type is a new data entry plus (if it is a new
action) one handler in `src/engine/rules/index.ts` — never surgery on the turn loop. The
current card set is **provisional** and exists only to prove the machinery; it is meant to
be replaced and expanded.

The catalog has eight cards:

| id | Name | What it does |
|---|---|---|
| `add1x1` | Add One Food To One Tray | +1 on one tray |
| `add1x2` | Add One Food To Two Trays | +1 on two trays |
| `add3x1` | Add Three Food To One Tray | +3 on one tray |
| `mul2x1` | Double Food On One Tray | ×2 on one tray |
| `mul2x2` | Double Food On Two Trays | ×2 on two trays |
| `mul3x1` | Triple Food On One Tray | ×3 on one tray |
| `addAll1` | Add One Food To Every Tray | +1 on every tray on your own table. It takes no tray choice |
| `servings2x2` | Extra Servings | The next 2 trays to arrive at your table each get +2. It takes no tray choice |

A card that takes no tray choice has `targets: 0`, and `submitTurn` sends an empty
`targetTrayIds`. Each player has a public list of upcoming bonuses, `extraServings`. The
first entry rides on the next tray to arrive, then leaves the list. A servings card played
this round boosts the tray that arrives at the end of this round first. Two servings cards
add up: playing a second one while `[2]` is pending makes the list `[4, 2]`. A discarded
card has no effect.

The starting deck is `STARTING_DECK`, 40 cards: `add1x1` 5, `add1x2` 7, `add3x1` 7,
`mul2x1` 7, `mul2x2` 6, `mul3x1` 6, `addAll1` 1, `servings2x2` 1. It seeds the default
deck on a fresh database. The Creator can then change the copies of each card. New card
types are still defined in code.

The end condition is a swappable predicate (`isGameOver`); the round-limit implementation is
the default. It is deliberately separate from ranking (`rankResult`), so the game can end on
a round limit without scores deciding when to stop.

## Known limitations (deliberate for this build)

- Game state is in-memory only — restarting the process drops all in-progress games.
  Accounts persist, in the SQLite database described above.
- Single process — no clustering or shared state.
- No "what would this card do?" preview query yet (the protocol union leaves room to add a
  read-only query without restructuring).
- The card set and balance are provisional placeholders, not final game design.
