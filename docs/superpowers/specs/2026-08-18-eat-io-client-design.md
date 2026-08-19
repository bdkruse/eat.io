# eat.io React Client — Design Spec

**Date:** 2026-08-18
**Scope:** The React client for eat.io — Part 2 of the build brief. The server and
`@eat.io/protocol` already exist in this repo and are **not** changed by this work.

Authority for this work is `REBUILD.md`, preserved at
`/Users/briankruse/sandbox/eat.io-design-export/REBUILD.md`. Part 0 is the binding
contract between the two halves; Part 2 briefs this one; **§2.8 is authoritative for
layout, visual language, and interaction feel**. Where this spec and the brief disagree,
the brief wins. Appendix B is explicitly superseded by §2.8 and is not a target.

---

## 1. Overview

A React client that connects to the eat.io server, gets matched into a game, plays it,
shows the result, and plays again. It **renders what the server sends and sends back what
the player attempted** — it computes no game state, resolves no card effects, and judges
no legality (§0.8).

The prototype this replaces had one screen, no session flow, fifteen `useState` calls in a
223-line component, a module-scope socket created at import time, and a message handler
made of ten sequential `hasOwnProperty` checks that overwrote each other. Each of those is
a named constraint below.

---

## 2. Decisions (settled during brainstorming)

- **Location:** `packages/client` in this monorepo, importing `@eat.io/protocol` through
  the workspace so protocol drift is a compile error (§0.5).
- **Stack:** Vite + React 19 + TypeScript strict, ESM. The browser's native `WebSocket`.
  No UI framework, no WebSocket library, no state library.
- **State management:** a **pure reducer** over the `ServerMessage` discriminated union,
  behind a small context provider. Chosen because §2.4 asks for exactly "a single
  reduction of server messages into one coherent state object," an exhaustive `switch`
  makes a forgotten message type a compile error, and a pure function tests without React.
- **Styling:** hand-written CSS implementing §2.8. No Bootstrap — the design is almost
  entirely absolute positioning, custom shadows, and transform-driven motion, none of
  which Bootstrap carries, and §2.2 forbids shipping unused dependencies. Fonts **Outfit**
  and **Karla** via `@fontsource/*` packages rather than a CDN link, so offline
  development works and the page makes no third-party request.
- **Testing:** logic only — reducer, selection rules, connection state machine. No
  component or motion tests. §2.2 requires no suite at all; this is the subset where bugs
  are invisible and expensive.

---

## 3. Package & file layout

```
packages/client/
  package.json            @eat.io/client; deps react, react-dom, @fontsource/{outfit,karla}
  tsconfig.json           extends ../../tsconfig.base.json, DOM libs, jsx: react-jsx
  vite.config.ts          react plugin; aliases @eat.io/protocol to its SOURCE
  index.html
  src/
    main.tsx              mounts <App/>
    App.tsx               picks a screen from derived state; renders overlays
    config.ts             VITE_SERVER_URL -> default ws://localhost:8000
    connection/
      connectionState.ts  pure phase machine + transitions
      useConnection.ts    owns the socket inside the app lifecycle
    state/
      gameState.ts        AppState shape, initial state, derived selectors
      gameReducer.ts      pure (state, Action) -> AppState; ONE exhaustive switch
      selection.ts        pure card/tray selection rules
      GameProvider.tsx    context; binds reducer to connection
    screens/
      ConnectScreen.tsx  QueueScreen.tsx  GameScreen.tsx  GameOverScreen.tsx
    components/
      board/  Board.tsx YourTable.tsx OpponentTable.tsx Tray.tsx Food.tsx Child.tsx
      hand/   Hand.tsx Card.tsx StatusPill.tsx
      overlays/ RejectionToast.tsx ConnectionLostBanner.tsx OpponentDroppedModal.tsx
      Header.tsx
    styles/
      tokens.css          §2.8.2 palette, type scale, shadow language
      *.css               per-component styles
  test/
    gameReducer.test.ts  selection.test.ts  connectionState.test.ts
  README.md
```

The root `package.json` gains the workspace entry and a `dev:client` script.

The client's `tsconfig.json` extends the shared base but **overrides `module` and
`moduleResolution` to `Bundler`** and adds `jsx: "react-jsx"` plus the DOM libs — Vite
resolves imports, not Node. It therefore stays **out of the `tsc -b` project graph**,
which builds the protocol and server for real emit; the client emits nothing (Vite owns
that), so it is typechecked by its own `tsc --noEmit`. The root `typecheck` script runs
both. `npm test` picks the client's tests up through the existing vitest include.

---

## 4. Architecture

Three concerns, kept apart because the prototype had all three in one component (§2.4).

```
Connection   owns the socket, its lifecycle and reconnection; validates every
             inbound frame against the shared schema; exposes typed events up
             and typed actions down. Nothing above it touches a raw socket.
Game state   one pure reduction of server messages into one state object.
             Derived values are computed, never stored and hand-synced.
Presentation components that read state and dispatch intents. They parse no
             messages and decide no outcomes.
```

Two requirements carried directly from prototype failures:

- **The socket is created inside the app lifecycle**, owned by `useConnection`, never a
  module-level singleton built at import time. It can be torn down, reconnected, and
  pointed at a different server.
- **One message handler, one state update.** A single exhaustive `switch` over
  `ServerMessage`. No sequential `if (has key)` blocks, and no two branches writing the
  same field.

---

## 5. State model

```ts
interface AppState {
  connection: ConnectionState;              // phase + last error
  name: string;                             // what the player typed; survives Back to menu
  identity: { playerId: string; sessionToken: string } | null;
  queued: boolean;
  room: RoomStateMessage | null;            // the server's full view, stored verbatim
  privateCode: string | null;
  result: Result | null;
  rejection: { code: RejectionCode; message: string; at: number } | null;
  opponentDropped: { graceEndsAt: number } | null;
}
```

`room` holds the server's `roomState` **verbatim**. Because the protocol sends full views
rather than deltas, every update **replaces** the board rather than merging into it, which
makes §2.5's "no stale state across games" structurally true for board data instead of a
discipline to maintain. The reducer still explicitly clears `result`, `rejection`,
`privateCode`, and `opponentDropped` when a new room begins, because those do not ride
along inside `roomState`.

**Which screen to show is derived, never stored** (§2.4 forbids hand-synced derived
values):

```
no identity                      -> connect
result !== null                  -> game over
room !== null                    -> game
queued                           -> queue
otherwise                        -> connect
```

Connection loss and opponent drop are **overlays on the current screen**, not screens, so
a paused board stays visible behind them.

### Actions

The reducer accepts a small union, so local UI events and server messages funnel through
one place:

| Action | Effect |
|---|---|
| `{ kind: "server", msg }` | The exhaustive switch below |
| `{ kind: "connection", state }` | Replaces `connection` |
| `{ kind: "playAgain" }` | Clears `room`, `result`, `rejection`; keeps identity |
| `{ kind: "backToMenu" }` | Clears `identity`, `room`, `result`, `queued`; keeps `name`. The connection layer closes the socket, so the player re-enters at Connect with their name prefilled |
| `{ kind: "dismissRejection" }` | Clears `rejection` |

### Server message handling

| Message | Reduction |
|---|---|
| `welcome` | Set `identity`; store `sessionToken` for reconnect |
| `error` | Record on `connection.error`; `PROTOCOL_MISMATCH` also clears `identity` |
| `queueWaiting` | `queued = true` |
| `queueCancelled` | `queued = false` |
| `roomJoinedPrivate` | Set `privateCode` |
| `roomState` | Replace `room`; `queued = false`; clear stale auxiliary state on a new room |
| `actionAccepted` | Clear `rejection` |
| `actionRejected` | Set `rejection` |
| `gameOver` | Set `result` |
| `opponentDisconnected` | Set `opponentDropped` |
| `opponentReconnected` | Clear `opponentDropped` |
| `roomLeft` | Clear `room`, `result`, `queued` |
| `pong` | No state change (liveness only) |

The client **does not send `ping`**. The server already runs WebSocket-level heartbeats,
and browsers answer those ping frames automatically without application code. The
protocol's `ping`/`pong` pair exists for clients that need it; adding a second liveness
mechanism here would duplicate one that already works. `pong` is handled solely so the
exhaustive switch stays exhaustive.

---

## 6. Selection rules

Selection is local UI state (§2.6) — legality is the server's call. Implemented as pure
functions so the §2.8.5 grammar is testable in isolation:

```ts
interface Selection { cardId: string | null; targetTrayIds: string[] }

selectCard(selection, cardId): Selection        // a different card clears targets
toggleTray(selection, trayId, targetCount): Selection
isSubmittable(selection, card): boolean
```

- Choosing a card clears any targets from a previous card.
- Selecting past the card's target count **drops the oldest selection** rather than
  refusing the click.
- Clicking a selected tray deselects it.
- Clicking a tray with **no card selected** returns the selection unchanged and signals
  the caller to raise the rejection toast — it never silently fails.
- `isSubmittable` is true only when a card is chosen **and** exactly its target count of
  trays is selected. End turn is enabled from this and nothing else.
- **No projected values.** Targets are shown by highlight only; a tray's number changes
  when the server says it has.

---

## 7. Session flow

Five destinations, each a real screen (§2.8.8):

- **Connect** — wordmark at 76px, the tagline, a name field, a **server URL field**, a
  connection dot with text label, and **Find a game** disabled until a name is entered.
- **Queue** — bobbing child, "Finding you a lunch buddy…", the player's name, **Cancel**.
- **In game** — §2.8.4: header with round and connection status; opponent's read-only
  table above; your interactive table below; status pill; hand; End turn.
- **Game over** — result badge (green "You ate the most" / blue "<name> ate the most" /
  amber "Dead even"), scorecard with the winning row outlined, **Play again** → queue and
  **Back to menu** → connect. Both fully reset game state.

A draw is a first-class result with its own colour and copy, not a missing winner (§0.7).

---

## 8. Visual implementation

§2.8 is authoritative; this section records only how it maps onto components.

- **Tokens.** The §2.8.2 palette, the two font families, and the hard offset shadow
  (`0 6px 0 rgba(...)`, no blur) live in `styles/tokens.css` as custom properties. Buttons
  translate down onto their shadow when pressed.
- **Trays.** Yours 130×104 with one large well (74×88) and two small (34×42); the
  opponent's 108×74 with two wells. Food quantity **is** the tray's value — one shape per
  point, distributed across wells proportionally to capacity. Placement is **deterministic
  per tray id**, so the same tray always looks the same and a changed value adds or
  removes shapes without rearranging the rest. Past 14, surplus collapses to a `+N` chip.
  **Every tray on both tables — yours and the opponent's — carries its exact value on a
  pill beneath it.** The number is never only implied by the food, and never requires
  counting shapes; the pill is the authority and the food is the at-a-glance read. The
  pill turns tomato while that tray is a selected target (§2.8.5).
- **Cards.** 118×156: coloured top strip with the effect glyph (`+3` green for add, `×2`
  amber for multiply), name, and a footer with the target count as a label plus that many
  pips. Everything comes from server data — **no `switch` over card ids, no hardcoded hand
  size, no assumed tray count** (§0.9).
- **The child.** Flat geometry — hair cap, head, eyes, mouth, shirt in the seat accent.
  Placeholder for real illustration; whatever replaces it must keep **the mouth as a
  separately animatable element**.
- **Layout.** Fixed-width board inside a horizontal scroll container, so a narrow window
  scrolls rather than clips. Both tables run left to right with the child at the right
  end; the score sits under the child, labelled EATEN on your side.

---

## 9. Motion

Motion is a function of state, **never a delay before adopting it** (§2.6). Server state
is applied the moment it arrives; these are transforms over already-current data.

| Transition | Behaviour |
|---|---|
| Advance | Tray *i* from the front sits at `translateX((n-1-i) * 146px)`; index drop transitions at `420ms cubic-bezier(.34,1.2,.5,1)` |
| Eaten | Departing tray held 600ms flagged eaten, animating to the child at `scale(.15)`, opacity 0; then dropped with transitions suppressed one frame |
| Bite | The child's mouth opens and closes over 140ms as that happens |
| Score | Updates immediately, plays a 320ms scale pop |
| New tray | Appended at the far end, fades in |
| Selection | 160ms lift |

Nothing else animates.

---

## 10. Unhappy paths

Designed, not deferred (§2.8.9).

- **Connection lost.** Amber full-width banner under the header. The board simultaneously
  drops to 45% opacity, desaturates, and takes `pointer-events: none`; the header dot
  turns tomato and reads *Reconnecting*. A player must never interact with, or mistake for
  live, a board that is not connected.
- **Opponent disconnected.** A modal distinguishing the two cases: inside the grace window,
  "…holding their seat for a moment. The table is paused, not ended," with an amber bar
  draining toward `graceEndsAt`; when the room resolves to `abandoned`, "…has left the
  lunchroom — no result is recorded." Only exit is **Leave game**.
- **Rejected action.** Tomato toast, bottom centre, rising 16px on entry, holding 3.4s,
  carrying the server's machine-readable reason as prose. Every rejection surfaces.

**Reconnection.** On an unexpected close the client retries with backoff, sending `hello`
with the stored `sessionToken` to reclaim its seat. Because views are full rather than
incremental, the resulting `roomState` restores the board with no merge logic.

---

## 11. Error handling

- An inbound frame that fails `parseServerMessage` is a **logged error, discarded** —
  never a crash and never a silently mangled board (§2.4).
- `actionRejected` always surfaces (§0.4). Nothing is swallowed.
- `PROTOCOL_MISMATCH` returns to Connect with an explanation rather than failing quietly.
- Every effect that subscribes, opens a socket, or sets a timer cleans up after itself
  (§2.7).

---

## 12. Configuration

| Setting | Default | Source |
|---|---|---|
| Server URL | `ws://localhost:8000` | `VITE_SERVER_URL`, overridable in the Connect screen field |

No hardcoded `ws://127.0.0.1:8000` literal anywhere (§2.3).

---

## 13. Testing

Logic only, in vitest, no DOM:

- **`gameReducer`** — full-view replacement; auxiliary state cleared on a new room; no
  stale state across two games in a row; `gameOver` sets a result; rejection surfaces and
  clears on the next accept; disconnect then reconnect returns to a live board;
  `PROTOCOL_MISMATCH` clears identity.
- **`selection`** — the §2.8.5 grammar: clear-on-card-change, drop-oldest past the target
  count, deselect, tray-without-card signals rather than fails, `isSubmittable` only at
  exactly the target count.
- **`connectionState`** — phase transitions including reconnect.

Visual fidelity and motion are verified by playing against the real server (§2.2 requires
no suite; components and animation are where assertions cost most and prove least).

---

## 14. Deliverables

- The three-layer client at `packages/client`.
- A README covering what it is, the stack choices **and why**, how to run it against a
  local server, the layer layout, and known limitations (§2.7).
- **An open-questions list** in that README: anywhere `PROTOCOL.md` proved silent or
  ambiguous, written down rather than decided unilaterally (§2.7).

---

## 15. Scope

**In:** the five screens and full session flow; connection lifecycle with reconnection;
the §2.8 visual language including trays, food, cards, and the child; the §2.8.7 motion
set; all three unhappy paths; public-queue matchmaking; private rooms by code.

**Out (documented as known limitations):** no spectator mode, chat, replays, or animation
beyond §2.8.7; no accounts or persistence beyond a session token and display name; no
component or visual test suite; no real illustration for the child; no mock server — you
develop against the real one (§2.2).

---

## 16. Quality bar

- Strict TypeScript, no `any` on anything protocol-shaped.
- Every list render has a proper `key`.
- No dead code: no commented-out imports, no state nothing sets, no unreachable screens.
- No `eslint-disable` used to silence a rule the code should simply satisfy.
- Every subscribing effect cleans up.
- Your table and the opponent's are separate components, never one behind an `isMine` flag.
- Rules content rendered from server data — no card-id switch, no hardcoded hand size or
  tray count.
