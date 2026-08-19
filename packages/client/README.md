# @eat.io/client

The React client for **eat.io** — connect, get matched, play, see the result, play again.
It renders what the server sends and sends back what the player attempted. It computes no
game state: no scores, no card effects, no round advancement, no legality judgements. Any
number on screen is a number the server calculated.

## Stack, and why

- **Vite + React 19 + TypeScript (strict, ESM).** The prototype used Create React App,
  which is deprecated and unmaintained; Vite replaces it with no framework baggage.
- **The browser's native `WebSocket`.** The prototype pulled in the `websocket` npm package
  for `w3cwebsocket`. There is no reason for that dependency in a browser build.
- **`@eat.io/protocol` imported directly** through the workspace, so message shapes are
  never redeclared and protocol drift is a compile error rather than a runtime surprise.
- **A pure reducer over the `ServerMessage` union**, not a store library. The architecture
  asks for "a single reduction of server messages into one coherent state object"; a
  reducer *is* that shape, an exhaustive `switch` makes a forgotten message type a compile
  error, and a pure function tests without React. The prototype's fifteen `useState` calls
  in one component are what this avoids.
- **Hand-written CSS**, no UI framework. The visual design is bespoke — formica speckle,
  moulded-plastic offset shadows, absolutely-positioned trays sliding on a custom easing —
  and a component framework would carry none of it while shipping code the design never
  uses.
- **Fonts via `@fontsource/*`** rather than a CDN link, so development works offline and
  the page makes no third-party request.

## Run it against a local server

```bash
npm install          # from the repo root
npm start            # terminal 1 — the game server on :8000
npm run dev:client   # terminal 2 — Vite dev server, prints its URL
```

Open the printed URL in **two** browser windows to play both seats.

The server URL defaults to `ws://localhost:8000`, is overridable at build time with
`VITE_SERVER_URL`, and can be edited in the field on the Connect screen. There is no
hardcoded server literal anywhere in the source.

```bash
npm test             # logic tests (reducer, selection, food layout, connection machine)
npm run typecheck    # strict tsc across all three packages
npm run build --workspace @eat.io/client
```

## Architecture

Three concerns, deliberately kept apart — the prototype had all three in one 223-line
component.

- **Connection** (`src/connection/`) — owns the socket **inside the app lifecycle**, never
  as a module-level singleton created at import time. Validates every inbound frame against
  the shared zod schema before it reaches application state; an unparseable frame is a
  logged error, not a crash. Reconnects with capped backoff, replaying the session token to
  reclaim the seat. The phase machine (`connectionState.ts`) is pure and tested.
- **Game state** (`src/state/`) — one pure reducer, one exhaustive `switch`, one place a
  message becomes state. Derived values (which screen to show, whether the game waits on
  you, whether the board is frozen) are **computed by selectors, never stored**.
- **Presentation** (`src/screens/`, `src/components/`) — reads state, dispatches intents.
  Parses no messages, decides no outcomes.

Two details worth knowing:

**The board is stored verbatim.** `roomState` carries a full view rather than deltas, so
the reducer replaces it wholesale. That makes "no stale state across games" structurally
true for board data instead of a discipline to maintain by hand.

**Motion never delays state.** Server state is applied the instant it arrives; the eaten
tray is an *additional* ghost element held for 600ms, not a postponed update. The prototype
deferred applying state inside a `setTimeout` so an animation could play, leaving the UI
showing stale values.

## Where the visuals live

`src/styles/tokens.css` holds the palette, the two font families, and the hard offset
shadow that makes surfaces read as moulded plastic. Food rendering — one shape per point,
distributed across tray wells proportionally to capacity — is `src/food/foodLayout.ts`.
Placement is deterministic per tray id and keyed to slot index, so a tray always looks the
same and a value change adds or removes shapes **without rearranging the rest**.

Card names, effect glyphs, target counts, hand size, and table length all come from server
data. There is no `switch` over card ids and no hardcoded tray count.

## Known limitations

- **The session token is held in memory only.** Reloading the page starts a new session and
  forfeits the seat; reconnection covers a dropped socket, not a refresh.
- **The opponent-dropped countdown assumes the clocks agree.** `graceEndsAt` is server
  epoch-ms compared against the browser's clock, so significant skew makes the draining bar
  inaccurate. The server still enforces the real deadline.
- **No component or visual tests.** Logic is tested; layout and motion are verified by
  playing.
- **The child is placeholder geometry**, not illustration. Whatever replaces it must keep
  the mouth as a separately animatable element.
- No spectator mode, chat, replays, or animation beyond the specified set.

## Playing privately

Connect, then either **Find a game** to join the public queue, or **Create a private room**
to get a four-digit code. Whoever you give it to enters it under **Join with code** and you
are seated together. A code is single-use and cannot be redeemed by its own creator; there
are no passwords. Cancelling while you wait releases the code.

## Open questions for the protocol

Recorded rather than decided unilaterally, per the client's quality bar:

- **`roomState.deadlineAt` is delivered but not surfaced.** The design's status pill states
  whose turn it is rather than counting down, so the 20-second turn clock is currently
  invisible to the player even though the server enforces it. Should there be a visible
  countdown?
- **A voluntary leave and an expired grace window are indistinguishable.** Both arrive as
  `phase: "abandoned"`, so the modal uses one wording for both. If the copy should differ,
  the protocol needs to say which happened.
- **"Play again" is expressed as a second `queueJoin`.** There is no explicit rematch
  message, so players are re-queued into the public pool rather than rematched with the same
  opponent. Is a rematch flow wanted?
