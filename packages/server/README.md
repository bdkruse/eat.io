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
| `ROUND_COUNT` | `10` | Rounds before the game ends |
| `MOVE_DEADLINE_MS` | `20000` | Per-player turn clock; idle players auto-discard |
| `RECONNECT_GRACE_MS` | `30000` | Grace window to reconnect after a drop |
| `HEARTBEAT_INTERVAL_MS` | `15000` | Ping cadence |
| `HEARTBEAT_TIMEOUT_MS` | `10000` | Missed-pong → connection dropped |
| `TABLE_LENGTH` | `5` | Trays per table |
| `HAND_SIZE` | `5` | Cards in hand |
| `RNG_SEED` | random | Fix for reproducible games |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## Architecture

Four layers; dependencies point downward only.

- **Transport** (`src/transport/`) — the `ws` server: accepts sockets, decodes and
  schema-validates every frame, runs heartbeats, and routes to the lobby. A bad message or
  a thrown handler never crashes the process.
- **Session** (`src/session/`) — one connected client: identity, a reconnection token, and a
  send that no-ops while detached (the socket is swapped on reconnect).
- **Lobby / Room** (`src/lobby/`) — the coordinator, matchmaker (public queue + single-use
  four-digit private codes), room registry with reaping, and the `Room` turn loop (submit → resolve, the 20s
  move deadline, disconnect/pause/reconnect/abandon, broadcast via per-player projection).
- **Game engine** (`src/engine/`) — **pure**: `(state, action) → state`. No sockets, no
  timers, no globals; clock and RNG are injected. A full game runs in a plain loop
  (`test/fullGame.test.ts`).

The protocol lives in the sibling package **`@eat.io/protocol`** and is documented in
[`PROTOCOL.md`](./PROTOCOL.md).

## Where the rules live

All game content is data in **`src/engine/rules/content.ts`** — the card catalog and tuning
(table length, hand size, tray value band, deck size). The engine applies effects by
dispatch over `card.action`, so adding a card type is a new data entry plus (if it is a new
action) one handler in `src/engine/rules/index.ts` — never surgery on the turn loop. The
current card set is **provisional** and exists only to prove the machinery; it is meant to
be replaced and expanded.

The end condition is a swappable predicate (`isGameOver`); the round-limit implementation is
the default. It is deliberately separate from ranking (`rankResult`), so the game can end on
a round limit without scores deciding when to stop.

## Known limitations (deliberate for this build)

- In-memory only — no persistence; restarting the process drops all games.
- No auth/accounts — just a display name and a session token.
- Single process — no clustering or shared state.
- No "what would this card do?" preview query yet (the protocol union leaves room to add a
  read-only query without restructuring).
- The card set and balance are provisional placeholders, not final game design.
