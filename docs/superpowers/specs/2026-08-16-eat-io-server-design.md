# eat.io Server — Design Spec

**Date:** 2026-08-16
**Scope:** The authoritative WebSocket game server for eat.io, plus the shared
`@eat.io/protocol` module it publishes. The React client is a separate, later task and
is **not** built here.

Authority for this work is `REBUILD.md` (the current copy with §2.8), preserved at
`/Users/briankruse/sandbox/eat.io-design-export/REBUILD.md`. Where this spec and the
brief disagree, the brief wins. Section references below (§0.x, §1.x) point into it.

---

## 1. Overview

eat.io is a two-player game. Each player has a **table** — an ordered queue of **trays**,
each holding a numeric value. Trays advance toward the end of the table; the tray that
arrives is **eaten** and its value is added to that player's score. Players play **cards**
to modify tray values before they are eaten. The game runs a fixed number of **rounds**
and then ends; **highest score wins**, and a **draw** is a real, representable outcome.

The server is **authoritative**: it owns all state, all rules evaluation, matchmaking, and
rooms, and it defines the protocol. It has no UI and serves no assets. The client renders
what the server sends and never computes game state (§0.8).

The single defining failure of the scrapped prototype was module-level global state, so the
process could host exactly one game ever. The central requirement of this rebuild is **many
concurrent, independent two-player rooms**.

---

## 2. Decisions (settled during brainstorming)

- **Monorepo** with a shared protocol package (see §3).
- **Stack:** Node 22 (installed: v22.22.3), TypeScript strict, ESM, the `ws` library for
  WebSocket, `zod` for runtime validation. Zod schemas are the **single source of truth**;
  TS types are `z.infer`red from them so wire format and types cannot drift (§0.5, §1.3).
  Minimal dependency surface otherwise.
- **Turn resolution:** simultaneous — the round resolves the instant **both** players have
  submitted. The barrier ("has everyone submitted?") is kept separate from resolution so a
  future switch to strict alternation does not touch the turn loop (§1.6).
- **Idle auto-move:** a player who is **connected but has not submitted** within the
  **20-second turn clock** has the server auto-play for them — **discard one random card**
  from hand (draw its replacement, no tray effect), counted as their submission — and the
  round resolves so play continues. This is rules content and swappable.
- **Reconnection:** in scope for v1. On join the server mints a `sessionToken`; on a
  disconnect mid-game the room **pauses** for a **30-second** grace window; reconnect within
  it re-attaches the socket to the existing seat; grace expiry resolves the room to
  `abandoned`.
- **Game length:** **10 rounds** by default, behind a swappable end-condition predicate
  (§0.7), configurable via env.
- **Rules content:** a provisional add/multiply card set in the spirit of Appendix A,
  clearly marked and built to be expanded. This is a **base set**, not final balance (§0.9).
- **Config:** environment variables with sane defaults, in one module (§1.7).

---

## 3. Package & file layout

```
eat.io/
  package.json                 # npm workspaces root
  tsconfig.base.json           # strict, ESM, shared compiler options
  README.md
  docs/superpowers/specs/      # this spec
  packages/
    protocol/                  # @eat.io/protocol — the shared contract (§0.5)
      package.json
      src/
        version.ts             # PROTOCOL_VERSION constant
        enums.ts               # shared domain enums
        messages.ts            # zod schemas for every message, both directions
        index.ts               # re-exports schemas + z.infer'd types
    server/                    # @eat.io/server
      package.json
      src/
        config.ts              # env -> typed config, one place (§1.7)
        logger.ts              # structured leveled logging (§1.7)
        transport/             # LAYER 1: ws server, framing, heartbeats, decode+validate
        session/               # LAYER 2: one client — identity, liveness, send queue
        lobby/                 # LAYER 3: matchmaking, room registry, lifecycle, broadcast
        engine/                # LAYER 4: pure rules — no I/O, no globals
          state.ts             #   room/game state types
          rules/
            content.ts         #     PROVISIONAL card set + tray/table config (data only)
            index.ts           #     the rules interface impl
          engine.ts            #   (state, playerId, action) -> { state, events }
          viewFor.ts           #   per-player projection (§0.8 secrecy)
        index.ts               # composition root: wires layers, starts server
      PROTOCOL.md              # the self-contained human protocol doc (§0.4)
```

The `packages/client` workspace is intentionally not scaffolded here; when the client is
built it will `import "@eat.io/protocol"` directly.

Rationale for the monorepo over two separate repos: the client depending on
`@eat.io/protocol` directly turns protocol drift into a compile error, which is precisely
what §0.5 wants. Copied/snapshotted protocol files drift; a workspace import does not.

---

## 4. Architecture

Four layers; dependencies point **downward only** (§1.4). The game engine at the bottom
imports no socket type, reaches for no clock or global RNG directly (both injected), and
does not know a room exists.

```
Transport   sockets, framing, heartbeats, encode/decode, schema validate
Session     one connected client: identity, liveness, send queue
Lobby/Room   matchmaking, room lifecycle, membership, broadcast fan-out
Game Engine  pure rules. No sockets, no timers, no I/O, no globals.
```

**No module-level mutable game state.** Every piece of state hangs off a room instance,
which hangs off the registry.

---

## 5. The protocol (§0.4)

The server defines it; the client consumes it. Every message is a zod schema in
`@eat.io/protocol`, a **discriminated union on `type`**, validated on receipt in **both**
directions. The handshake carries `PROTOCOL_VERSION`; a mismatch fails loudly.

Principles: every client action gets an explicit response (accepted or typed rejection);
unrecognized/illegal messages are never silently ignored; state updates carry the
receiving player's **full view**, not deltas; errors are typed and **non-fatal** (a bad
message from one client affects only that client); **hidden information is absent from the
payload**, not merely hidden by the UI.

### 5.1 Client → Server

| Message | Payload | Purpose |
|---|---|---|
| `hello` | `{ protocolVersion, name, sessionToken? }` | Handshake; `sessionToken` present = reconnect attempt |
| `queue.join` | `{}` | Join public matchmaking queue |
| `queue.cancel` | `{}` | Leave the queue |
| `room.createPrivate` | `{}` | Create a private room, receive a join code |
| `room.joinPrivate` | `{ code }` | Join a private room by code |
| `game.submitTurn` | `{ cardId, targetTrayIds[] }` | The one game action — semantic, not UI |
| `room.leave` | `{}` | Leave current room (back to menu) |
| `ping` | `{}` | Liveness (paired with server `pong`) |

The action vocabulary is deliberately small and additive; adding an action later must not
disturb existing ones (§0.4). The union is shaped so a read-only "what would this card do?"
query could be added later without restructuring — not built now.

### 5.2 Server → Client

| Message | Payload | When |
|---|---|---|
| `welcome` | `{ playerId, sessionToken }` | After a valid `hello` |
| `error` | `{ code, message }` | Malformed/invalid/unknown message — typed, non-fatal, that client only |
| `queue.waiting` | `{}` | Confirmed in queue |
| `room.state` | full per-player view (§5.3) | Any state change — never deltas |
| `action.accepted` | `{}` | A `submitTurn` was accepted (awaiting the other player) |
| `action.rejected` | `{ code, message }` | A `submitTurn` was illegal |
| `game.over` | `{ result }` | Terminal — result is win/loss **or draw** (§0.7) |
| `opponent.disconnected` | `{ graceEndsAt }` | Opponent dropped; room paused, countdown to abandon |
| `opponent.reconnected` | `{}` | Opponent returned within grace |
| `pong` | `{}` | Reply to `ping` |

Rejection codes are machine-readable and UI-renderable: `NOT_YOUR_TURN`, `CARD_NOT_HELD`,
`BAD_TARGET`, `WRONG_TARGET_COUNT`, `ALREADY_SUBMITTED`, `NOT_IN_ROOM` (extensible).

### 5.3 `room.state` — the per-player view

The full view **for the receiving player** (§0.8):

- **You:** table (ordered trays, each `{ id, value }`), hand (each card `{ id, name,
  action, amount, targets }` — all data, per §0.9), score, your submission status this round.
- **Opponent:** table, score, **hand count only** (never their cards), submission status.
- **Round:** `roundIndex`, `roundCount`.
- **Turn clock:** `deadlineAt` — the authoritative move deadline the server enforces; the
  client renders a countdown but never decides the timeout.
- **Phase:** `waiting | in-progress | paused | finished | abandoned`.

The opponent's hand contents, either player's deck order, and any face-down state are
**absent** from the payload.

---

## 6. Engine & state model

The engine is pure: `(state, playerId, action) → { state, events }`. Clock and RNG are
injected; a seeded RNG makes shuffles reproducible and games replayable. A full game must
be runnable in a plain loop with no server running — if it is not, the seam is wrong.

### 6.1 State (one object per room, off the registry — never module-level)

- `roomId`, `phase`
- `roundIndex`, `roundCount`
- `players: Record<playerId, PlayerState>` — a **keyed collection**, always iterated, never
  `playerOne`/`playerTwo` or positional `clients[0]`/`clients[1]`
- `PlayerState`: `seat`, `name`, `connected`, `table` (ordered trays), `hand`, `deck`
  (private), `score`, this round's `submission` (chosen card + targets, or none)
- `rng` state for deterministic resolution

Round index and within-round submission state are tracked **distinctly** — never a single
integer conflating "a player acted," "a round completed," and "an update was sent" (§0.7).

### 6.2 Engine operations (§1.6)

1. `validateAction(state, playerId, action)` → ok | typed rejection. Confirms the sender is
   a seated player, it is a legal moment to act, they hold the named card, and the targeted
   trays exist and are legal. Never trusts a client-supplied index/id/quantity (§0.8).
2. `applyAction(state, playerId, action)` → records that player's submission; no board
   change yet.
3. `autoMove(state, playerId)` → idle-timeout move: discard a random card, draw a
   replacement, record as submission. Rules content — swappable.
4. `everyoneSubmitted(state)` → the barrier, **separate** from resolution.
5. `resolveRound(state)` → applies both submissions, eats each table's front tray, scores
   it, draws replacements, appends new trays, **increments `roundIndex`**. Card effects are
   resolved by **dispatch over card data**, not an `if/else` chain — a new card type is a
   new handler entry, not surgery on existing logic.
6. `isGameOver(state)` → **swappable predicate**; round-limit implementation for now. Must
   **not** look at scores.
7. `rankResult(state)` → produces a **result** (ordered scores; win / loss / **draw**). Must
   **not** decide when to stop. Ending the game and deciding the winner are separate
   operations (§0.7).
8. `viewFor(state, playerId)` → the per-player projection that omits all hidden info (§0.8);
   the only thing the room ever sends.

### 6.3 Rules module (`engine/rules/`)

Card set, tray value distribution, table length, hand size, and starting conditions are
declared as **data** in `content.ts`, consumed through a rules interface. The provisional
base set is Appendix-A-style add/multiply cards, clearly marked and expandable. Turn
resolution mode (simultaneous now) is rules content, not plumbing.

---

## 7. Runtime layers

### 7.1 Transport (Layer 1)

A `ws` server. Each inbound frame is decoded and **validated against the zod schema before
anything else touches it**; an unparseable or invalid frame yields a typed `error` to that
socket, logged at debug — never a crash, never affecting the room. Owns **heartbeats**:
ping/pong on an interval with a timeout; a socket missing its pong is treated as dropped.

### 7.2 Session (Layer 2)

One connected client: `playerId`, `sessionToken` (minted at `hello`, used for reconnect),
liveness, and an outbound **send queue**. Nothing above transport touches a raw socket.

### 7.3 Lobby / Room (Layer 3)

- **Room registry** — a keyed collection of many concurrent rooms, each fully isolated.
- **Matchmaking** — a public queue (paired with the next waiting player) and private rooms
  (create → code; join by code).
- **Lifecycle** — `waiting → in-progress → finished`, plus terminal `abandoned` and
  transient `paused`. Rooms are **reaped** when finished or empty so memory is bounded.
- **Broadcast through projection** — on any state change the room sends each seat its
  `viewFor(...)` `room.state`. Written **once**, iterating the players collection.
- **Move-deadline timer** — when a round opens, arm a 20s timer per un-submitted player
  (injected clock). Fires → `engine.autoMove` → resolve if the barrier is now complete.
  Cleared when the player submits.

### 7.4 Disconnect & reconnection

Two separate mechanisms:

- **Connected but idle past the 20s deadline** → move-deadline timer → auto-discard.
- **Disconnected mid-game** → room `paused`; opponent gets `opponent.disconnected
  { graceEndsAt }`; a **30s** grace timer starts; move-deadline clocks are suspended while
  paused.
  - **Reconnect within grace:** `hello` + `sessionToken` re-attaches the socket to the
    existing seat; room un-pauses; both players get a fresh `room.state` (trivial because
    views are full, not deltas); opponent gets `opponent.reconnected`.
  - **Grace expires:** room resolves to `abandoned`; the remaining player is moved to a
    defined state, never left on a dead barrier.

### 7.5 Process safety (§1.7)

An unhandled exception in one room is caught at the room boundary and never takes down the
process or another room. Graceful shutdown: stop accepting connections, notify rooms, close
sockets cleanly.

---

## 8. Configuration (§1.7)

One `config.ts`, env → typed values, sane defaults, no scattered magic numbers.

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | WebSocket listen port |
| `ROUND_COUNT` | `10` | Rounds before the game ends |
| `MOVE_DEADLINE_MS` | `20000` | Per-player turn clock |
| `RECONNECT_GRACE_MS` | `30000` | Disconnect grace window |
| `HEARTBEAT_INTERVAL_MS` | `15000` | Ping cadence |
| `HEARTBEAT_TIMEOUT_MS` | `10000` | Missed-pong → dropped |
| `TABLE_LENGTH` | `5` | Trays per table (rules content) |
| `HAND_SIZE` | `5` | Cards in hand (rules content) |
| `RNG_SEED` | random | Set to make a run reproducible |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

---

## 9. Logging & errors

**Logging (§1.7):** structured, leveled. Connection and room lifecycle at `info`,
per-message detail at `debug`. No bare leftover `console.log`.

**Errors — two separated kinds, both non-fatal (§0.4):**
- **Transport/protocol** (`error`): malformed, schema-invalid, or unknown message → typed
  code + message to that one socket.
- **Action rejection** (`action.rejected`): well-formed but illegal move → machine-readable
  code the UI can render.

The engine independently re-validates every move; a hostile client that sends arbitrary
frames must not be able to see hidden state, desync a room, or make an illegal move (§0.8).

---

## 10. Testing

No test suite is required (§1.2); tests are written where they earn their place. The pure
engine is the high-value target: full games played in a plain loop, covering resolution
math, the round-limit end condition, draw detection, idle auto-move, and — critically —
`viewFor` **omitting** hidden information (the secrecy guarantee). Transport plumbing is not
heavily tested.

---

## 11. Deliverables (§1.8)

- The four-layer server.
- The `@eat.io/protocol` shared module (zod schemas as source of truth).
- `PROTOCOL.md`: a self-contained protocol document whose only assumed reader is an agent
  with no access to server source — every message type, both directions, every field, and
  when each is sent.
- `README`: what it is, stack choice and why, how to run it, the layer layout, where the
  rules live and how to change them, and known limitations.

---

## 12. Scope

**In (v1):** many concurrent rooms; public queue + private-code matchmaking; full lifecycle
+ reaping; heartbeats; disconnect → pause → **reconnection (30s)** or abandon; idle
auto-discard (20s turn clock); simultaneous resolution; swappable end-condition and rules
modules; provisional add/multiply card base set; per-player projection; strict TS with no
`any` at protocol boundaries.

**Out (documented as known limitations):** no persistence/DB; no auth/accounts; no
clustering (single process); no card-preview query (union seam left for it); no real or
balanced game rules; no HTTP or static-asset serving.

---

## 13. Quality bar (§1.8)

- Strict TypeScript, no `any` at module boundaries that touch the protocol.
- No dead code, no commented-out alternatives, no TODO as the only handling for a real case
  — genuine deferrals are recorded here / in the README as known limitations.
- Per-player logic written **once** over a collection, never duplicated per seat.
- Small, focused modules with honest names.
