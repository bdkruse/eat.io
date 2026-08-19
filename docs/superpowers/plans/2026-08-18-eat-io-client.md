# eat.io React Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the eat.io React client — connect, get matched, play a game, see the result, play again — rendering server state faithfully and computing none of it.

**Architecture:** Three layers with strict separation (§2.4). **Connection** owns the socket inside the app lifecycle and validates every inbound frame against the shared zod schema. **Game state** is one pure reducer over the `ServerMessage` discriminated union, behind a context provider; derived values are computed by selectors, never stored. **Presentation** reads state and dispatches intents — it parses no messages and decides no outcomes.

**Tech Stack:** Vite 5, React 19, TypeScript (strict, ESM), the browser's native `WebSocket`, `@fontsource/outfit` + `@fontsource/karla`, vitest for logic tests. No UI framework, no state library, no WebSocket library.

**Spec:** `docs/superpowers/specs/2026-08-18-eat-io-client-design.md` (read it alongside this plan; `§` references point into `REBUILD.md`, preserved at `/Users/briankruse/sandbox/eat.io-design-export/REBUILD.md`).

## Global Constraints

- **TypeScript strict**, no `any` on anything protocol-shaped. Message types are imported from `@eat.io/protocol`, never redeclared locally (§0.5, §2.3).
- **The client computes no game state.** No scores, no card effects, no round advancement, no legality judgements (§0.8). If a number is displayed, the server sent it.
- **No projected values.** A targeted tray shows a highlight; its number changes only when the server says it has (§2.8.5).
- **Render rules content from data** (§0.9). No `switch` over card ids, no hardcoded hand size, no hardcoded tray count. `.slice(0, 5)` on a tray row is the exact prototype bug to avoid.
- **The socket is never a module-level singleton created at import time** (§2.4). It is owned by a hook inside the app lifecycle.
- **One message handler, one state update** — a single exhaustive `switch` over `ServerMessage` with a `never` check (§2.4). No sequential `if (has key)` blocks.
- **Your table and the opponent's are separate components**, never one behind an `isMine` flag (§2.6, §2.8.4).
- **Motion is a function of state, never a delay before adopting it** (§2.6). Server state is applied the instant it arrives.
- **Every rejection surfaces** (§0.4). Nothing is silently swallowed.
- **Every list render has a proper `key`**; every subscribing effect cleans up (§2.7).
- **The reducer is pure** — no `Date.now()`, no `Math.random()`. Anything time- or entropy-shaped arrives in the action or is derived from a stable id.
- **No dead code**, no commented-out imports, no state nothing sets, no `eslint-disable` used to silence a rule the code should satisfy (§2.7).
- **Commits:** conventional-commit style; **no Claude/Anthropic branding or co-author trailer** (user rule).

---

## File Structure

```
packages/client/
  package.json                   @eat.io/client
  tsconfig.json                  Bundler resolution, DOM libs, noEmit (Vite owns the build)
  vite.config.ts                 react plugin; aliases @eat.io/protocol to SOURCE
  index.html
  src/
    main.tsx                     mounts <App/>
    App.tsx                      picks a screen from derived state; renders overlays
    config.ts                    VITE_SERVER_URL -> ws://localhost:8000
    connection/
      connectionState.ts         pure phase machine + backoff
      useConnection.ts           owns the socket in the app lifecycle
    state/
      gameState.ts               AppState, initial state, derived selectors
      gameReducer.ts             pure (state, Action) -> AppState
      selection.ts               pure card/tray selection grammar
      GameProvider.tsx           context; binds reducer to connection
    food/
      foodLayout.ts              deterministic food distribution + placement
    screens/
      ConnectScreen.tsx  QueueScreen.tsx  GameScreen.tsx  GameOverScreen.tsx
    components/
      Header.tsx
      board/  Board.tsx YourTable.tsx OpponentTable.tsx Tray.tsx Food.tsx Child.tsx
      hand/   Hand.tsx Card.tsx StatusPill.tsx
      overlays/ RejectionToast.tsx ConnectionLostBanner.tsx OpponentDroppedModal.tsx
    styles/
      tokens.css                 §2.8.2 palette, type, shadow language
      app.css board.css hand.css screens.css overlays.css
  test/
    config.test.ts  connectionState.test.ts  gameReducer.test.ts
    selection.test.ts  foodLayout.test.ts
  README.md
```

Root `package.json` gains the `packages/client` workspace entry, a `dev:client` script, and an extended `typecheck`.

---

### Task 1: Client package scaffold + config

Stands up the Vite/React workspace so every later task has a green `typecheck`, `test`, and `build`. Setup is folded in here; the deliverable is "install, typecheck, one passing test, and a production build all succeed."

**Files:**
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/vite.config.ts`, `packages/client/index.html`
- Create: `packages/client/src/main.tsx`, `packages/client/src/App.tsx`, `packages/client/src/config.ts`
- Create: `packages/client/test/config.test.ts`
- Modify: `package.json` (root — workspaces, scripts)

**Interfaces:**
- Produces: `defaultServerUrl(env?): string` from `src/config.ts`; a mounting React app; `@eat.io/protocol` resolvable from client source.

- [ ] **Step 1: Create `packages/client/package.json`**

```json
{
  "name": "@eat.io/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@eat.io/protocol": "*",
    "@fontsource/karla": "^5.0.0",
    "@fontsource/outfit": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

Note: `vite@^5.4.0` deliberately matches the version vitest 2.1 already brings in, so the workspace does not end up with two major versions of Vite.

- [ ] **Step 2: Create `packages/client/tsconfig.json`**

The shared base is `composite` with `NodeNext` resolution, which suits the protocol and server (both emit real output). A Vite app emits nothing and resolves like a bundler, so those three settings are overridden.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "composite": false,
    "declaration": false,
    "noEmit": true,
    "paths": { "@eat.io/protocol": ["../protocol/src/index.ts"] }
  },
  "include": ["src/**/*", "test/**/*", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `packages/client/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point at protocol SOURCE so dev needs no build step, mirroring vitest.config.ts.
      "@eat.io/protocol": fileURLToPath(new URL("../protocol/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173 },
});
```

- [ ] **Step 4: Create `packages/client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>eat.io</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Update the root `package.json`**

Add `"packages/client"` to `workspaces`, and replace the `scripts` block with:

```json
  "scripts": {
    "typecheck": "tsc -b && tsc -p packages/client",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx watch packages/server/src/index.ts",
    "dev:client": "npm run dev --workspace @eat.io/client",
    "start": "tsx packages/server/src/index.ts"
  }
```

`tsc -b` builds the protocol and server; `tsc -p packages/client` typechecks the client without emitting.

- [ ] **Step 6: Write the failing test**

`packages/client/test/config.test.ts`:
```ts
import { expect, test } from "vitest";
import { defaultServerUrl } from "../src/config.js";

test("falls back to the local server when nothing is configured", () => {
  expect(defaultServerUrl({})).toBe("ws://localhost:8000");
  expect(defaultServerUrl({ VITE_SERVER_URL: "   " })).toBe("ws://localhost:8000");
});

test("an explicit VITE_SERVER_URL wins", () => {
  expect(defaultServerUrl({ VITE_SERVER_URL: "ws://game.example:9000" })).toBe(
    "ws://game.example:9000",
  );
});
```

- [ ] **Step 7: Install and run the test to see it fail**

Run: `npm install && npm test -- config`
Expected: FAIL — `../src/config.js` not found.

- [ ] **Step 8: Create `packages/client/src/config.ts`**

```ts
/** Never hardcode a server literal at a call site — §2.3. */
const FALLBACK_SERVER_URL = "ws://localhost:8000";

type ViteEnv = Record<string, string | undefined>;

export function defaultServerUrl(env: ViteEnv): string {
  const configured = env["VITE_SERVER_URL"];
  if (configured === undefined || configured.trim() === "") return FALLBACK_SERVER_URL;
  return configured.trim();
}

/** The value the Connect screen starts with; the player may override it in the field. */
export function initialServerUrl(): string {
  return defaultServerUrl(import.meta.env as unknown as ViteEnv);
}
```

- [ ] **Step 9: Create `packages/client/src/App.tsx`**

```tsx
export function App() {
  return <main>eat.io</main>;
}
```

- [ ] **Step 10: Create `packages/client/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 11: Verify the whole toolchain**

Run: `npm test -- config && npm run typecheck && npm run build --workspace @eat.io/client`
Expected: test PASS; typecheck exits 0; Vite build succeeds.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore(client): scaffold Vite + React 19 client workspace"
```

---

### Task 2: Connection state machine

The pure phase machine the connection hook drives. Kept separate from the socket so reconnection logic is testable without a network.

**Files:**
- Create: `packages/client/src/connection/connectionState.ts`
- Test: `packages/client/test/connectionState.test.ts`

**Interfaces:**
- Produces: `type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting" | "failed"`; `interface ConnectionState { phase: ConnectionPhase; error: string | null; attempt: number }`; `initialConnectionState`; `type ConnectionEvent`; `connectionReducer(state, event): ConnectionState`; `backoffMs(attempt): number`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/connectionState.test.ts`:
```ts
import { expect, test } from "vitest";
import {
  backoffMs,
  connectionReducer,
  initialConnectionState,
  type ConnectionState,
} from "../src/connection/connectionState.js";

const after = (state: ConnectionState, ...events: Parameters<typeof connectionReducer>[1][]) =>
  events.reduce(connectionReducer, state);

test("a successful connection clears errors and resets the attempt counter", () => {
  const state = after(initialConnectionState, { type: "connect" }, { type: "opened" });
  expect(state.phase).toBe("connected");
  expect(state.error).toBeNull();
  expect(state.attempt).toBe(0);
});

test("losing a live session moves to reconnecting and counts attempts", () => {
  let state = after(initialConnectionState, { type: "connect" }, { type: "opened" });
  state = connectionReducer(state, { type: "closed", hadSession: true });
  expect(state.phase).toBe("reconnecting");
  expect(state.attempt).toBe(1);
  state = connectionReducer(state, { type: "closed", hadSession: true });
  expect(state.attempt).toBe(2);
});

test("closing without a session simply returns to idle", () => {
  const state = after(
    initialConnectionState,
    { type: "connect" },
    { type: "opened" },
    { type: "closed", hadSession: false },
  );
  expect(state.phase).toBe("idle");
  expect(state.attempt).toBe(0);
});

test("a failure records the reason and is recoverable by connecting again", () => {
  let state = connectionReducer(initialConnectionState, { type: "failed", error: "nope" });
  expect(state).toMatchObject({ phase: "failed", error: "nope" });
  state = connectionReducer(state, { type: "connect" });
  expect(state.phase).toBe("connecting");
  expect(state.error).toBeNull();
});

test("reset returns to the initial state", () => {
  const live = after(initialConnectionState, { type: "connect" }, { type: "opened" });
  expect(connectionReducer(live, { type: "reset" })).toEqual(initialConnectionState);
});

test("backoff grows then caps, and is never zero", () => {
  expect(backoffMs(1)).toBe(500);
  expect(backoffMs(2)).toBe(1000);
  expect(backoffMs(3)).toBe(2000);
  expect(backoffMs(99)).toBe(8000);
  expect(backoffMs(0)).toBe(500);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- connectionState`
Expected: FAIL — `../src/connection/connectionState.js` not found.

- [ ] **Step 3: Implement `packages/client/src/connection/connectionState.ts`**

```ts
export type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface ConnectionState {
  phase: ConnectionPhase;
  error: string | null;
  /** Consecutive reconnect attempts; drives the backoff and resets on success. */
  attempt: number;
}

export const initialConnectionState: ConnectionState = {
  phase: "idle",
  error: null,
  attempt: 0,
};

export type ConnectionEvent =
  | { type: "connect" }
  | { type: "opened" }
  | { type: "closed"; hadSession: boolean }
  | { type: "failed"; error: string }
  | { type: "reset" };

export function connectionReducer(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event.type) {
    case "connect":
      return { ...state, phase: "connecting", error: null };
    case "opened":
      return { phase: "connected", error: null, attempt: 0 };
    case "closed":
      // With a session in hand the seat is still ours for the grace window, so retry.
      return event.hadSession
        ? { ...state, phase: "reconnecting", attempt: state.attempt + 1 }
        : { ...initialConnectionState };
    case "failed":
      return { ...state, phase: "failed", error: event.error };
    case "reset":
      return { ...initialConnectionState };
    default: {
      const never: never = event;
      return never;
    }
  }
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

/** Exponential backoff, capped so a long outage still retries on a sane cadence. */
export function backoffMs(attempt: number): number {
  const steps = Math.max(0, attempt - 1);
  return Math.min(BASE_DELAY_MS * 2 ** steps, MAX_DELAY_MS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- connectionState`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): pure connection phase machine with capped backoff"
```

---
### Task 3: App state shape + derived selectors

The single state object and the selectors computed from it. §2.4 forbids storing derived values and hand-syncing them, so **which screen to show is a function, not a field**.

**Files:**
- Create: `packages/client/src/state/gameState.ts`
- Test: `packages/client/test/gameState.test.ts`

**Interfaces:**
- Consumes: `ConnectionState`, `initialConnectionState` (Task 2); `RoomStateMessage`, `Result`, `RejectionCode` (protocol).
- Produces: `interface Rejection { code: RejectionCode; message: string; seq: number }`; `interface AppState`; `initialAppState`; `type Screen = "connect" | "queue" | "game" | "gameOver"`; `selectScreen(state): Screen`; `selectAwaitingYou(state): boolean`; `selectBoardFrozen(state): boolean`; `selectYourCard(state, cardId): CardView | undefined`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/gameState.test.ts`:
```ts
import { expect, test } from "vitest";
import type { RoomStateMessage } from "@eat.io/protocol";
import {
  initialAppState,
  selectAwaitingYou,
  selectBoardFrozen,
  selectScreen,
  type AppState,
} from "../src/state/gameState.js";

const room = (over: Partial<RoomStateMessage> = {}): RoomStateMessage => ({
  type: "roomState",
  phase: "in-progress",
  roundIndex: 0,
  roundCount: 10,
  deadlineAt: 20000,
  you: { seat: "a", name: "Riley", score: 0, submitted: false, table: [], hand: [] },
  opponent: { seat: "b", name: "Sam", score: 0, submitted: false, handCount: 5, table: [] },
  ...over,
});

const seated = (over: Partial<AppState> = {}): AppState => ({
  ...initialAppState,
  identity: { playerId: "p1", sessionToken: "tok" },
  connection: { phase: "connected", error: null, attempt: 0 },
  ...over,
});

test("no identity means the connect screen, whatever else is set", () => {
  expect(selectScreen(initialAppState)).toBe("connect");
  expect(selectScreen({ ...initialAppState, queued: true })).toBe("connect");
});

test("screens are derived in priority order: result, then room, then queue", () => {
  expect(selectScreen(seated({ queued: true }))).toBe("queue");
  expect(selectScreen(seated({ room: room() }))).toBe("game");
  expect(
    selectScreen(seated({ room: room(), result: { kind: "win", scores: { a: 3, b: 1 } } })),
  ).toBe("gameOver");
});

test("awaiting-you is explicit, never inferred from a round index", () => {
  expect(selectAwaitingYou(seated({ room: room() }))).toBe(true);
  const submitted = room({
    you: { seat: "a", name: "Riley", score: 0, submitted: true, table: [], hand: [] },
  });
  expect(selectAwaitingYou(seated({ room: submitted }))).toBe(false);
  expect(selectAwaitingYou(seated({ room: room({ phase: "paused" }) }))).toBe(false);
});

test("the board is frozen whenever the socket is not live", () => {
  expect(selectBoardFrozen(seated({ room: room() }))).toBe(false);
  expect(
    selectBoardFrozen(
      seated({ room: room(), connection: { phase: "reconnecting", error: null, attempt: 1 } }),
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- gameState`
Expected: FAIL — `../src/state/gameState.js` not found.

- [ ] **Step 3: Implement `packages/client/src/state/gameState.ts`**

```ts
import type { CardView, RejectionCode, Result, RoomStateMessage } from "@eat.io/protocol";
import { initialConnectionState, type ConnectionState } from "../connection/connectionState.js";

export interface Rejection {
  /** "LOCAL" marks a client-side complaint (e.g. a tray clicked with no card chosen),
   *  so it is never mistaken for a code the server actually sent. */
  code: RejectionCode | "LOCAL";
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
  seq: number;
}

export interface AppState {
  connection: ConnectionState;
  /** What the player typed. Survives "Back to menu" so the field is prefilled. */
  name: string;
  identity: { playerId: string; sessionToken: string } | null;
  queued: boolean;
  /** The server's full view, stored verbatim — every update replaces it (§2.5). */
  room: RoomStateMessage | null;
  privateCode: string | null;
  result: Result | null;
  rejection: Rejection | null;
  opponentDropped: { graceEndsAt: number } | null;
}

export const initialAppState: AppState = {
  connection: initialConnectionState,
  name: "",
  identity: null,
  queued: false,
  room: null,
  privateCode: null,
  result: null,
  rejection: null,
  opponentDropped: null,
};

export type Screen = "connect" | "queue" | "game" | "gameOver";

/** Derived, never stored (§2.4). Order matters: a finished game outranks its board. */
export function selectScreen(state: AppState): Screen {
  if (!state.identity) return "connect";
  if (state.result) return "gameOver";
  if (state.room) return "game";
  if (state.queued) return "queue";
  return "connect";
}

/** Explicit from the server's submitted flags — never inferred from a turn index (§2.8.10). */
export function selectAwaitingYou(state: AppState): boolean {
  const room = state.room;
  if (!room || room.phase !== "in-progress") return false;
  return !room.you.submitted;
}

/** A board that is not connected must be visibly dead and non-interactive (§2.8.9). */
export function selectBoardFrozen(state: AppState): boolean {
  return state.connection.phase !== "connected";
}

export function selectYourCard(state: AppState, cardId: string | null): CardView | undefined {
  if (!cardId || !state.room) return undefined;
  return state.room.you.hand.find((card) => card.id === cardId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameState`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): app state shape with derived screen selectors"
```

---

### Task 4: The game reducer

The single place a server message becomes state. One exhaustive `switch` with a `never` check, so the compiler flags any message the server adds (§2.4). This is the task that kills the prototype's whole class of bugs.

**Files:**
- Create: `packages/client/src/state/gameReducer.ts`
- Test: `packages/client/test/gameReducer.test.ts`

**Interfaces:**
- Consumes: `AppState`, `initialAppState` (Task 3); `ConnectionState` (Task 2); `ServerMessage` (protocol).
- Produces: `type Action`; `gameReducer(state: AppState, action: Action): AppState`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/gameReducer.test.ts`:
```ts
import { expect, test } from "vitest";
import type { RoomStateMessage, ServerMessage } from "@eat.io/protocol";
import { initialAppState, type AppState } from "../src/state/gameState.js";
import { gameReducer } from "../src/state/gameReducer.js";

const server = (state: AppState, msg: ServerMessage) => gameReducer(state, { kind: "server", msg });
const play = (state: AppState, ...messages: ServerMessage[]) => messages.reduce(server, state);

const welcomed = () =>
  server(initialAppState, { type: "welcome", playerId: "p1", sessionToken: "tok" });

const room = (over: Partial<RoomStateMessage> = {}): RoomStateMessage => ({
  type: "roomState",
  phase: "in-progress",
  roundIndex: 0,
  roundCount: 10,
  deadlineAt: 20000,
  you: { seat: "a", name: "Riley", score: 0, submitted: false, table: [], hand: [] },
  opponent: { seat: "b", name: "Sam", score: 0, submitted: false, handCount: 5, table: [] },
  ...over,
});

test("welcome establishes identity and stores the reconnect token", () => {
  const state = welcomed();
  expect(state.identity).toEqual({ playerId: "p1", sessionToken: "tok" });
});

test("roomState replaces the board wholesale rather than merging", () => {
  const first = play(welcomed(), room({ roundIndex: 0 }));
  const second = play(first, room({ roundIndex: 4, you: { seat: "a", name: "Riley", score: 9, submitted: true, table: [], hand: [] } }));
  expect(second.room?.roundIndex).toBe(4);
  expect(second.room?.you.score).toBe(9);
  expect(second.room?.you.submitted).toBe(true);
});

test("entering a room clears the queue flag and any private code", () => {
  const queued = play(welcomed(), { type: "queueWaiting" }, { type: "roomJoinedPrivate", code: "ABCD" });
  expect(queued.queued).toBe(true);
  expect(queued.privateCode).toBe("ABCD");
  const playing = play(queued, room());
  expect(playing.queued).toBe(false);
  expect(playing.privateCode).toBeNull();
});

test("queueCancelled clears the queue flag", () => {
  const state = play(welcomed(), { type: "queueWaiting" }, { type: "queueCancelled" });
  expect(state.queued).toBe(false);
});

test("a rejection surfaces and each one re-triggers via an incrementing seq", () => {
  let state = play(welcomed(), room());
  state = server(state, { type: "actionRejected", code: "CARD_NOT_HELD", message: "nope" });
  expect(state.rejection).toMatchObject({ code: "CARD_NOT_HELD", message: "nope", seq: 1 });
  state = server(state, { type: "actionRejected", code: "CARD_NOT_HELD", message: "nope" });
  expect(state.rejection?.seq).toBe(2);
});

test("an accepted action clears a lingering rejection", () => {
  let state = play(welcomed(), room(), {
    type: "actionRejected",
    code: "BAD_TARGET",
    message: "no",
  });
  state = server(state, { type: "actionAccepted" });
  expect(state.rejection).toBeNull();
});

test("opponent disconnect and reconnect toggle the overlay state", () => {
  let state = play(welcomed(), room());
  state = server(state, { type: "opponentDisconnected", graceEndsAt: 30000 });
  expect(state.opponentDropped).toEqual({ graceEndsAt: 30000 });
  state = server(state, { type: "opponentReconnected" });
  expect(state.opponentDropped).toBeNull();
});

test("gameOver records the result without discarding the final board", () => {
  const state = play(welcomed(), room({ roundIndex: 10 }), {
    type: "gameOver",
    result: { kind: "draw", scores: { a: 12, b: 12 } },
  });
  expect(state.result).toEqual({ kind: "draw", scores: { a: 12, b: 12 } });
  expect(state.room?.roundIndex).toBe(10);
});

test("playAgain clears the game but keeps the session — no stale state across games", () => {
  let state = play(welcomed(), room({ roundIndex: 10 }), {
    type: "gameOver",
    result: { kind: "win", scores: { a: 20, b: 3 } },
  });
  state = server(state, { type: "actionRejected", code: "BAD_TARGET", message: "no" });
  state = gameReducer(state, { kind: "playAgain" });
  expect(state.room).toBeNull();
  expect(state.result).toBeNull();
  expect(state.rejection).toBeNull();
  expect(state.identity).not.toBeNull();
});

test("a second game starts clean rather than inheriting the first", () => {
  let state = play(welcomed(), room({ roundIndex: 10 }), {
    type: "gameOver",
    result: { kind: "win", scores: { a: 20, b: 3 } },
  });
  state = gameReducer(state, { kind: "playAgain" });
  state = play(state, { type: "queueWaiting" }, room({ roundIndex: 0 }));
  expect(state.room?.roundIndex).toBe(0);
  expect(state.result).toBeNull();
  expect(state.opponentDropped).toBeNull();
});

test("backToMenu drops the session but keeps the typed name", () => {
  let state = gameReducer(welcomed(), { kind: "nameChanged", name: "Riley" });
  state = play(state, room());
  state = gameReducer(state, { kind: "backToMenu" });
  expect(state.identity).toBeNull();
  expect(state.room).toBeNull();
  expect(state.name).toBe("Riley");
});

test("a protocol mismatch clears identity so the player lands back on connect", () => {
  const state = server(welcomed(), {
    type: "error",
    code: "PROTOCOL_MISMATCH",
    message: "Server speaks protocol 1.",
  });
  expect(state.identity).toBeNull();
  expect(state.connection.error).toContain("protocol");
});

test("roomLeft returns to the menu state without dropping the session", () => {
  let state = play(welcomed(), room());
  state = server(state, { type: "roomLeft" });
  expect(state.room).toBeNull();
  expect(state.queued).toBe(false);
  expect(state.identity).not.toBeNull();
});

test("a local rejection surfaces through the same channel, marked LOCAL", () => {
  const state = gameReducer(welcomed(), {
    kind: "localRejection",
    message: "Pick a card first.",
  });
  expect(state.rejection).toMatchObject({ code: "LOCAL", message: "Pick a card first.", seq: 1 });
});

test("pong changes nothing", () => {
  const before = play(welcomed(), room());
  expect(server(before, { type: "pong" })).toEqual(before);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- gameReducer`
Expected: FAIL — `../src/state/gameReducer.js` not found.

- [ ] **Step 3: Implement `packages/client/src/state/gameReducer.ts`**

```ts
import type { ServerMessage } from "@eat.io/protocol";
import type { ConnectionState } from "../connection/connectionState.js";
import { initialAppState, type AppState } from "./gameState.js";

export type Action =
  | { kind: "server"; msg: ServerMessage }
  | { kind: "connection"; state: ConnectionState }
  | { kind: "nameChanged"; name: string }
  | { kind: "localRejection"; message: string }
  | { kind: "playAgain" }
  | { kind: "backToMenu" }
  | { kind: "dismissRejection" };

/** Everything a new room must not inherit from the previous one (§2.5). */
const CLEARED_FOR_NEW_ROOM = {
  queued: false,
  privateCode: null,
  result: null,
  rejection: null,
  opponentDropped: null,
} as const;

export function gameReducer(state: AppState, action: Action): AppState {
  switch (action.kind) {
    case "server":
      return reduceServerMessage(state, action.msg);
    case "connection":
      return { ...state, connection: action.state };
    case "nameChanged":
      return { ...state, name: action.name };
    case "localRejection":
      // The UI's own complaint, surfaced through the same toast as a server rejection.
      return {
        ...state,
        rejection: {
          code: "LOCAL",
          message: action.message,
          seq: (state.rejection?.seq ?? 0) + 1,
        },
      };
    case "playAgain":
      return { ...state, room: null, ...CLEARED_FOR_NEW_ROOM };
    case "backToMenu":
      return { ...initialAppState, connection: state.connection, name: state.name };
    case "dismissRejection":
      return { ...state, rejection: null };
    default: {
      const never: never = action;
      return never;
    }
  }
}

/**
 * The ONE place a server message becomes state. A single exhaustive switch, so adding a
 * message type to the protocol is a compile error here rather than a silent no-op (§2.4).
 */
function reduceServerMessage(state: AppState, msg: ServerMessage): AppState {
  switch (msg.type) {
    case "welcome":
      return {
        ...state,
        identity: { playerId: msg.playerId, sessionToken: msg.sessionToken },
      };

    case "error": {
      const fatal = msg.code === "PROTOCOL_MISMATCH";
      return {
        ...state,
        identity: fatal ? null : state.identity,
        connection: { ...state.connection, error: `${msg.code}: ${msg.message}` },
      };
    }

    case "queueWaiting":
      return { ...state, queued: true };

    case "queueCancelled":
      return { ...state, queued: false };

    case "roomJoinedPrivate":
      return { ...state, privateCode: msg.code };

    case "roomState": {
      // Full views, not deltas — replace rather than merge, and drop anything that
      // belonged to a previous room the moment a new one starts.
      const isNewRoom = state.room === null;
      return {
        ...state,
        room: msg,
        queued: false,
        privateCode: null,
        ...(isNewRoom ? { result: null, rejection: null, opponentDropped: null } : {}),
      };
    }

    case "actionAccepted":
      return { ...state, rejection: null };

    case "actionRejected":
      return {
        ...state,
        rejection: {
          code: msg.code,
          message: msg.message,
          seq: (state.rejection?.seq ?? 0) + 1,
        },
      };

    case "gameOver":
      return { ...state, result: msg.result };

    case "opponentDisconnected":
      return { ...state, opponentDropped: { graceEndsAt: msg.graceEndsAt } };

    case "opponentReconnected":
      return { ...state, opponentDropped: null };

    case "roomLeft":
      return { ...state, room: null, ...CLEARED_FOR_NEW_ROOM };

    case "pong":
      return state; // liveness only; handled so the switch stays exhaustive

    default: {
      const never: never = msg;
      return never;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameReducer`
Expected: PASS (15 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): pure game reducer with one exhaustive message switch"
```

---

### Task 5: Selection grammar

The §2.8.5 interaction rules as pure functions. Selection is legitimately client-side; **legality is the server's call** (§2.6), so nothing here judges a move — it only tracks what the player has picked.

**Files:**
- Create: `packages/client/src/state/selection.ts`
- Test: `packages/client/test/selection.test.ts`

**Interfaces:**
- Produces: `interface Selection { cardId: string | null; targetTrayIds: string[] }`; `emptySelection`; `selectCard(selection, cardId): Selection`; `interface TrayClickResult { selection: Selection; needsCardFirst: boolean }`; `toggleTray(selection, trayId, targetCount): TrayClickResult`; `isSubmittable(selection, targetCount): boolean`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/selection.test.ts`:
```ts
import { expect, test } from "vitest";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
} from "../src/state/selection.js";

test("choosing a different card clears the targets picked for the old one", () => {
  let selection = selectCard(emptySelection, "mul2x2");
  selection = toggleTray(selection, "t1", 2).selection;
  selection = toggleTray(selection, "t2", 2).selection;
  expect(selection.targetTrayIds).toEqual(["t1", "t2"]);

  selection = selectCard(selection, "add1x1");
  expect(selection.cardId).toBe("add1x1");
  expect(selection.targetTrayIds).toEqual([]);
});

test("re-picking the same card leaves the selection untouched", () => {
  const selection = selectCard(emptySelection, "add1x1");
  expect(selectCard(selection, "add1x1")).toBe(selection);
});

test("clicking a tray with no card selected signals rather than silently failing", () => {
  const result = toggleTray(emptySelection, "t1", 1);
  expect(result.needsCardFirst).toBe(true);
  expect(result.selection).toEqual(emptySelection);
});

test("selecting past the target count drops the OLDEST selection rather than refusing", () => {
  let selection = selectCard(emptySelection, "add1x1"); // one target
  selection = toggleTray(selection, "t1", 1).selection;
  selection = toggleTray(selection, "t2", 1).selection;
  expect(selection.targetTrayIds).toEqual(["t2"]);
});

test("a two-target card keeps selection order, dropping the oldest on overflow", () => {
  let selection = selectCard(emptySelection, "mul2x2");
  for (const id of ["t1", "t2", "t3"]) selection = toggleTray(selection, id, 2).selection;
  expect(selection.targetTrayIds).toEqual(["t2", "t3"]);
});

test("clicking a selected tray deselects it", () => {
  let selection = selectCard(emptySelection, "mul2x2");
  selection = toggleTray(selection, "t1", 2).selection;
  selection = toggleTray(selection, "t2", 2).selection;
  selection = toggleTray(selection, "t1", 2).selection;
  expect(selection.targetTrayIds).toEqual(["t2"]);
});

test("submittable requires a card AND exactly its target count", () => {
  let selection = selectCard(emptySelection, "mul2x2");
  expect(isSubmittable(selection, 2)).toBe(false);
  selection = toggleTray(selection, "t1", 2).selection;
  expect(isSubmittable(selection, 2)).toBe(false);
  selection = toggleTray(selection, "t2", 2).selection;
  expect(isSubmittable(selection, 2)).toBe(true);
});

test("no card means never submittable, however many trays are somehow set", () => {
  expect(isSubmittable({ cardId: null, targetTrayIds: ["t1"] }, 1)).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- selection`
Expected: FAIL — `../src/state/selection.js` not found.

- [ ] **Step 3: Implement `packages/client/src/state/selection.ts`**

```ts
/**
 * Local UI state for what the player has picked. Tracks the selection only — whether it
 * is a *legal move* is the server's decision (§2.6, §0.8).
 */
export interface Selection {
  cardId: string | null;
  /** In click order — §2.8.5 shows numbered badges for multi-target cards. */
  targetTrayIds: string[];
}

export const emptySelection: Selection = { cardId: null, targetTrayIds: [] };

export function selectCard(selection: Selection, cardId: string): Selection {
  if (selection.cardId === cardId) return selection;
  return { cardId, targetTrayIds: [] };
}

export interface TrayClickResult {
  selection: Selection;
  /** True when the click was refused because no card is chosen — the caller toasts. */
  needsCardFirst: boolean;
}

export function toggleTray(
  selection: Selection,
  trayId: string,
  targetCount: number,
): TrayClickResult {
  if (selection.cardId === null) {
    return { selection, needsCardFirst: true };
  }
  if (selection.targetTrayIds.includes(trayId)) {
    return {
      selection: {
        ...selection,
        targetTrayIds: selection.targetTrayIds.filter((id) => id !== trayId),
      },
      needsCardFirst: false,
    };
  }
  // Past the card's capacity, drop the oldest rather than refusing the click (§2.8.5).
  const appended = [...selection.targetTrayIds, trayId];
  const targetTrayIds =
    appended.length > targetCount ? appended.slice(appended.length - targetCount) : appended;
  return { selection: { ...selection, targetTrayIds }, needsCardFirst: false };
}

/** End turn is enabled from this and nothing else (§2.8.5). */
export function isSubmittable(selection: Selection, targetCount: number): boolean {
  return selection.cardId !== null && selection.targetTrayIds.length === targetCount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- selection`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): pure card/tray selection grammar"
```

---
### Task 6: Deterministic food layout

§2.8.3's rule — **food quantity is the tray's value**, one shape per point, distributed across wells proportionally to capacity, placement deterministic per tray id so a tray always looks the same and a value change adds or removes shapes **without rearranging the rest**. That last requirement is what forces slot positions to depend on `(trayId, wellIndex, slotIndex)` and never on the current total.

**Files:**
- Create: `packages/client/src/food/foodLayout.ts`
- Test: `packages/client/test/foodLayout.test.ts`

**Interfaces:**
- Produces: `interface Well { width: number; height: number; columns: number; rows: number }`; `YOUR_WELLS`, `OPPONENT_WELLS` (readonly `Well[]`); `distribute(value, capacities): number[]`; `interface FoodShape { key: string; x: number; y: number; size: number; kind: "circle" | "square"; color: string }`; `foodForWell(trayId, wellIndex, count, well): FoodShape[]`; `interface TrayFood { perWell: FoodShape[][]; overflow: number }`; `layoutTray(trayId, value, wells): TrayFood`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/foodLayout.test.ts`:
```ts
import { expect, test } from "vitest";
import {
  distribute,
  layoutTray,
  OPPONENT_WELLS,
  YOUR_WELLS,
} from "../src/food/foodLayout.js";

const capacityOf = (wells: typeof YOUR_WELLS) =>
  wells.reduce((total, well) => total + well.columns * well.rows, 0);

test("distribute places every unit and never exceeds a well's capacity", () => {
  const capacities = [12, 2, 2];
  for (let value = 0; value <= 16; value++) {
    const spread = distribute(value, capacities);
    expect(spread.reduce((a, b) => a + b, 0)).toBe(Math.min(value, 16));
    spread.forEach((count, index) => expect(count).toBeLessThanOrEqual(capacities[index]!));
  }
});

test("distribute favours the larger well proportionally", () => {
  const [large, smallA, smallB] = distribute(8, [12, 2, 2]);
  expect(large).toBeGreaterThan(smallA!);
  expect(smallA).toBe(smallB);
});

test("a tray's food total equals its value until the tray physically fills", () => {
  const capacity = capacityOf(YOUR_WELLS);
  const shown = (value: number) =>
    layoutTray("t1", value, YOUR_WELLS).perWell.flat().length;
  expect(shown(1)).toBe(1);
  expect(shown(7)).toBe(7);
  expect(shown(capacity)).toBe(capacity);
});

test("past capacity the surplus becomes an overflow count, never a lost number", () => {
  const capacity = capacityOf(YOUR_WELLS);
  const laid = layoutTray("t1", capacity + 5, YOUR_WELLS);
  expect(laid.perWell.flat().length).toBe(capacity);
  expect(laid.overflow).toBe(5);
});

test("the same tray id always produces the identical layout", () => {
  expect(layoutTray("t7", 6, YOUR_WELLS)).toEqual(layoutTray("t7", 6, YOUR_WELLS));
});

test("different tray ids produce different arrangements", () => {
  const a = layoutTray("t1", 6, YOUR_WELLS).perWell.flat().map((s) => `${s.x},${s.y}`);
  const b = layoutTray("t2", 6, YOUR_WELLS).perWell.flat().map((s) => `${s.x},${s.y}`);
  expect(a).not.toEqual(b);
});

test("gaining a point adds a shape without moving the existing ones", () => {
  const before = layoutTray("t3", 5, YOUR_WELLS).perWell.flat();
  const after = layoutTray("t3", 6, YOUR_WELLS).perWell.flat();
  expect(after.length).toBe(before.length + 1);
  for (const shape of before) {
    const same = after.find((candidate) => candidate.key === shape.key);
    expect(same).toBeDefined();
    expect(same!.x).toBe(shape.x);
    expect(same!.y).toBe(shape.y);
  }
});

test("losing a point removes shapes without moving the survivors", () => {
  const before = layoutTray("t4", 9, YOUR_WELLS).perWell.flat();
  const after = layoutTray("t4", 4, YOUR_WELLS).perWell.flat();
  for (const shape of after) {
    const same = before.find((candidate) => candidate.key === shape.key)!;
    expect(same.x).toBe(shape.x);
    expect(same.y).toBe(shape.y);
  }
});

test("the opponent's smaller tray has its own, smaller capacity", () => {
  expect(capacityOf(OPPONENT_WELLS)).toBeLessThan(capacityOf(YOUR_WELLS));
  expect(layoutTray("t1", 99, OPPONENT_WELLS).perWell.flat().length).toBe(
    capacityOf(OPPONENT_WELLS),
  );
});

test("a zero-value tray is simply empty", () => {
  const laid = layoutTray("t5", 0, YOUR_WELLS);
  expect(laid.perWell.flat()).toEqual([]);
  expect(laid.overflow).toBe(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- foodLayout`
Expected: FAIL — `../src/food/foodLayout.js` not found.

- [ ] **Step 3: Implement `packages/client/src/food/foodLayout.ts`**

```ts
/**
 * §2.8.3: food quantity IS the tray's value — one shape per point, spread across the
 * wells in proportion to their capacity and stable across updates.
 *
 * Placement depends only on (trayId, wellIndex, slotIndex), never on the current total.
 * That is what lets a tray gain or lose food without the remaining shapes rearranging.
 */

export interface Well {
  width: number;
  height: number;
  columns: number;
  rows: number;
}

/** Your tray: 130x104, one large well (74x88) and two small (34x42) — §2.8.3. */
export const YOUR_WELLS: readonly Well[] = [
  { width: 74, height: 88, columns: 3, rows: 4 },
  { width: 34, height: 42, columns: 1, rows: 2 },
  { width: 34, height: 42, columns: 1, rows: 2 },
];

/** The opponent's tray: 108x74, two wells, read-only and smaller. */
export const OPPONENT_WELLS: readonly Well[] = [
  { width: 60, height: 58, columns: 3, rows: 2 },
  { width: 30, height: 42, columns: 1, rows: 2 },
];

const FOOD_COLORS = ["#e2703a", "#5f9e4a", "#e8c04d", "#c9543f", "#7fae6b", "#d98f3d"] as const;

/** FNV-1a — small, dependency-free, and stable across runs. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic 0..1 from a seed, used only for jitter and shape choice. */
function unitRandom(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value >>>= 0;
  value ^= value >> 17;
  value ^= value << 5;
  value >>>= 0;
  return value / 0xffffffff;
}

/**
 * Largest-remainder apportionment, clamped per well. Returns how many food shapes each
 * well receives; the caller compares the total against `value` to find any overflow.
 */
export function distribute(value: number, capacities: readonly number[]): number[] {
  const totalCapacity = capacities.reduce((total, capacity) => total + capacity, 0);
  const target = Math.max(0, Math.min(value, totalCapacity));
  if (target === 0) return capacities.map(() => 0);

  const exact = capacities.map((capacity) => (capacity / totalCapacity) * target);
  const counts = exact.map((share, index) => Math.min(Math.floor(share), capacities[index]!));

  let remaining = target - counts.reduce((total, count) => total + count, 0);
  const byRemainder = exact
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  // Hand out the leftovers, skipping any well that is already full.
  while (remaining > 0) {
    const before = remaining;
    for (const { index } of byRemainder) {
      if (remaining === 0) break;
      if (counts[index]! >= capacities[index]!) continue;
      counts[index]! += 1;
      remaining -= 1;
    }
    if (remaining === before) break; // every well full — cannot place more
  }
  return counts;
}

export interface FoodShape {
  /** Stable across value changes, so React keys and position assertions both hold. */
  key: string;
  x: number;
  y: number;
  size: number;
  kind: "circle" | "square";
  color: string;
}

export function foodForWell(
  trayId: string,
  wellIndex: number,
  count: number,
  well: Well,
): FoodShape[] {
  const shapes: FoodShape[] = [];
  const cellWidth = well.width / well.columns;
  const cellHeight = well.height / well.rows;
  const size = Math.max(6, Math.min(cellWidth, cellHeight) * 0.62);

  for (let slot = 0; slot < count; slot++) {
    const column = slot % well.columns;
    const row = Math.floor(slot / well.columns);
    const seed = hashString(`${trayId}:${wellIndex}:${slot}`);
    const jitterX = (unitRandom(seed) - 0.5) * (cellWidth - size) * 0.6;
    const jitterY = (unitRandom(seed ^ 0x9e3779b9) - 0.5) * (cellHeight - size) * 0.6;

    shapes.push({
      key: `${trayId}:${wellIndex}:${slot}`,
      x: cellWidth * (column + 0.5) + jitterX - size / 2,
      y: cellHeight * (row + 0.5) + jitterY - size / 2,
      size,
      kind: unitRandom(seed ^ 0x5bf03635) < 0.5 ? "circle" : "square",
      color: FOOD_COLORS[seed % FOOD_COLORS.length]!,
    });
  }
  return shapes;
}

export interface TrayFood {
  perWell: FoodShape[][];
  /** Food the tray cannot physically show; rendered as a `+N` chip (§2.8.3). */
  overflow: number;
}

export function layoutTray(trayId: string, value: number, wells: readonly Well[]): TrayFood {
  const capacities = wells.map((well) => well.columns * well.rows);
  const counts = distribute(value, capacities);
  const placed = counts.reduce((total, count) => total + count, 0);
  return {
    perWell: counts.map((count, index) => foodForWell(trayId, index, count, wells[index]!)),
    overflow: Math.max(0, value - placed),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- foodLayout`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): deterministic, non-rearranging food layout"
```

---

### Task 7: Connection hook

Owns the socket **inside the app lifecycle** — never a module singleton (§2.4). Validates every inbound frame with the shared schema before it reaches state, reconnects with backoff carrying the session token, and cleans up on unmount.

**Files:**
- Create: `packages/client/src/connection/useConnection.ts`
- Modify: none

**Interfaces:**
- Consumes: `connectionReducer`, `backoffMs`, `initialConnectionState`, `ConnectionState` (Task 2); `parseClientMessage` is not needed — outbound is already typed; `parseServerMessage`, `ClientMessage`, `ServerMessage`, `PROTOCOL_VERSION` (protocol).
- Produces: `interface UseConnection { connection: ConnectionState; connect(url: string, name: string): void; disconnect(): void; send(msg: ClientMessage): void }`; `useConnection(onMessage: (msg: ServerMessage) => void, onConnectionChange: (state: ConnectionState) => void): UseConnection`.

- [ ] **Step 1: Implement `packages/client/src/connection/useConnection.ts`**

There is no unit test for this hook — it is the socket boundary, and §2.2 does not require component or integration tests. Its logic lives in `connectionState.ts`, which is tested. Verification is Task 15's live play against the real server.

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import {
  backoffMs,
  connectionReducer,
  initialConnectionState,
  type ConnectionState,
} from "./connectionState.js";

export interface UseConnection {
  connection: ConnectionState;
  connect(url: string, name: string): void;
  disconnect(): void;
  send(msg: ClientMessage): void;
}

export function useConnection(
  onMessage: (msg: ServerMessage) => void,
  onConnectionChange: (state: ConnectionState) => void,
): UseConnection {
  const [connection, setConnection] = useState<ConnectionState>(initialConnectionState);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const targetRef = useRef<{ url: string; name: string } | null>(null);
  const wantOpenRef = useRef(false);
  const stateRef = useRef<ConnectionState>(initialConnectionState);

  // Callbacks live in refs so the socket effect never re-subscribes on a re-render.
  const messageRef = useRef(onMessage);
  const changeRef = useRef(onConnectionChange);
  useEffect(() => {
    messageRef.current = onMessage;
    changeRef.current = onConnectionChange;
  }, [onMessage, onConnectionChange]);

  const applyEvent = useCallback((event: Parameters<typeof connectionReducer>[1]) => {
    const next = connectionReducer(stateRef.current, event);
    stateRef.current = next;
    setConnection(next);
    changeRef.current(next);
  }, []);

  const openSocket = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;

    applyEvent({ type: "connect" });
    const socket = new WebSocket(target.url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      applyEvent({ type: "opened" });
      const hello: ClientMessage = sessionRef.current
        ? {
            type: "hello",
            protocolVersion: PROTOCOL_VERSION,
            name: target.name,
            sessionToken: sessionRef.current,
          }
        : { type: "hello", protocolVersion: PROTOCOL_VERSION, name: target.name };
      socket.send(JSON.stringify(hello));
    });

    socket.addEventListener("message", (event) => {
      let msg: ServerMessage;
      try {
        msg = parseServerMessage(JSON.parse(String(event.data)));
      } catch (error) {
        // A frame we cannot understand is a logged error, never a crash and never a
        // silently mangled board (§2.4).
        console.error("eat.io: discarded an invalid server frame", error);
        return;
      }
      if (msg.type === "welcome") sessionRef.current = msg.sessionToken;
      messageRef.current(msg);
    });

    socket.addEventListener("close", () => {
      socketRef.current = null;
      if (!wantOpenRef.current) {
        applyEvent({ type: "closed", hadSession: false });
        return;
      }
      applyEvent({ type: "closed", hadSession: sessionRef.current !== null });
      const delay = backoffMs(stateRef.current.attempt);
      retryRef.current = setTimeout(openSocket, delay);
    });

    socket.addEventListener("error", () => {
      // 'close' always follows; recording the reason here keeps the banner honest.
      applyEvent({ type: "failed", error: "Could not reach the server." });
    });
  }, [applyEvent]);

  const connect = useCallback(
    (url: string, name: string) => {
      targetRef.current = { url, name };
      wantOpenRef.current = true;
      sessionRef.current = null; // a fresh connect is a new session, not a reconnect
      openSocket();
    },
    [openSocket],
  );

  const disconnect = useCallback(() => {
    wantOpenRef.current = false;
    sessionRef.current = null;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    applyEvent({ type: "reset" });
  }, [applyEvent]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(msg));
  }, []);

  // Every effect that opens a connection or sets a timer cleans up after itself (§2.7).
  useEffect(() => {
    return () => {
      wantOpenRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, []);

  return { connection, connect, disconnect, send };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(client): socket owned in the app lifecycle, validated and reconnecting"
```

---

### Task 8: Game provider (context)

Binds the reducer to the connection and exposes typed intents downward. This is the only place the two halves meet.

**Files:**
- Create: `packages/client/src/state/GameProvider.tsx`

**Interfaces:**
- Consumes: `gameReducer`, `Action` (Task 4); `AppState`, `initialAppState` (Task 3); `useConnection` (Task 7); `ClientMessage` (protocol).
- Produces: `interface GameApi { state: AppState; connect(url, name): void; leaveToMenu(): void; joinQueue(): void; cancelQueue(): void; createPrivate(): void; joinPrivate(code): void; submitTurn(cardId, targetTrayIds): void; leaveRoom(): void; playAgain(): void; dismissRejection(): void; setName(name): void }`; `<GameProvider>`; `useGame(): GameApi`.

- [ ] **Step 1: Implement `packages/client/src/state/GameProvider.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { ServerMessage } from "@eat.io/protocol";
import type { ConnectionState } from "../connection/connectionState.js";
import { useConnection } from "../connection/useConnection.js";
import { gameReducer } from "./gameReducer.js";
import { initialAppState, type AppState } from "./gameState.js";

export interface GameApi {
  state: AppState;
  connect(url: string, name: string): void;
  leaveToMenu(): void;
  joinQueue(): void;
  cancelQueue(): void;
  createPrivate(): void;
  joinPrivate(code: string): void;
  submitTurn(cardId: string, targetTrayIds: string[]): void;
  leaveRoom(): void;
  playAgain(): void;
  dismissRejection(): void;
  noteLocalRejection(message: string): void;
  setName(name: string): void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialAppState);

  const handleMessage = useCallback((msg: ServerMessage) => {
    dispatch({ kind: "server", msg });
  }, []);

  const handleConnectionChange = useCallback((next: ConnectionState) => {
    dispatch({ kind: "connection", state: next });
  }, []);

  const { connect, disconnect, send } = useConnection(handleMessage, handleConnectionChange);

  const api = useMemo<GameApi>(
    () => ({
      state,
      connect,
      leaveToMenu: () => {
        disconnect();
        dispatch({ kind: "backToMenu" });
      },
      joinQueue: () => send({ type: "queueJoin" }),
      cancelQueue: () => send({ type: "queueCancel" }),
      createPrivate: () => send({ type: "roomCreatePrivate" }),
      joinPrivate: (code) => send({ type: "roomJoinPrivate", code }),
      submitTurn: (cardId, targetTrayIds) =>
        send({ type: "submitTurn", cardId, targetTrayIds }),
      leaveRoom: () => send({ type: "roomLeave" }),
      playAgain: () => {
        dispatch({ kind: "playAgain" });
        send({ type: "queueJoin" });
      },
      dismissRejection: () => dispatch({ kind: "dismissRejection" }),
      noteLocalRejection: (message) => dispatch({ kind: "localRejection", message }),
      setName: (name) => dispatch({ kind: "nameChanged", name }),
    }),
    [state, connect, disconnect, send],
  );

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const api = useContext(GameContext);
  if (!api) throw new Error("useGame must be used inside <GameProvider>");
  return api;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): game context binding the reducer to the connection"
```

---
### Task 9: Design tokens + app shell

The §2.8.2 palette, type, and shadow language as custom properties, plus the header and the screen switch. After this task the app runs and shows the Connect screen frame.

**Files:**
- Create: `packages/client/src/styles/tokens.css`, `packages/client/src/styles/app.css`
- Create: `packages/client/src/components/Header.tsx`
- Modify: `packages/client/src/App.tsx`, `packages/client/src/main.tsx`

**Interfaces:**
- Consumes: `useGame` (Task 8); `selectScreen` (Task 3).
- Produces: `<Header>`; `<App>` rendering one of four screens.

- [ ] **Step 1: Create `packages/client/src/styles/tokens.css`**

```css
/* §2.8.2 — cafeteria formica and lunch-tray plastic. Two accents only, one per seat. */
:root {
  --app-bg: #cfe0d3;
  --surface: #fbf8f1;
  --tray-plastic: linear-gradient(#f9f5ec, #eae3d4);
  --tray-border: #d3c9b5;
  --well: #e0d8c6;
  --table-edge: #d9c9a4;
  --table-edge-border: #b99b6b;

  --ink: #232a24;
  --ink-2: #5c6b5f;
  --ink-3: #7a8a7d;

  --you: #d94f3d;      /* tomato */
  --opponent: #4a7fa5; /* blue */
  --add: #5f9e4a;
  --multiply: #e8a33d;
  --reject: #8c2f22;

  --font-structural: "Outfit", system-ui, sans-serif;
  --font-body: "Karla", system-ui, sans-serif;

  /* Hard offset, never blurred — it is what makes surfaces read as moulded plastic. */
  --shadow: 0 6px 0 rgba(35, 42, 36, 0.18);
  --shadow-deep: 0 10px 0 rgba(35, 42, 36, 0.22);
  --radius: 14px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--ink);
  background-color: var(--app-bg);
  /* Two-layer speckle at 14px and 22px — the formica texture. */
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.55) 1px, transparent 1px),
    radial-gradient(rgba(35, 42, 36, 0.06) 1px, transparent 1px);
  background-size: 14px 14px, 22px 22px;
  background-position: 0 0, 7px 11px;
  min-height: 100vh;
}

h1, h2, h3, button, .structural { font-family: var(--font-structural); font-weight: 700; }

button {
  font-family: var(--font-structural);
  font-weight: 700;
  border: none;
  border-radius: var(--radius);
  padding: 12px 22px;
  font-size: 16px;
  color: #fff;
  background: var(--you);
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: transform 120ms, box-shadow 120ms;
}
button:active:not(:disabled) { transform: translateY(6px); box-shadow: none; }
button:disabled { background: #b9c3ba; box-shadow: 0 6px 0 rgba(35, 42, 36, 0.1); cursor: default; }
```

- [ ] **Step 2: Create `packages/client/src/styles/app.css`**

```css
.app { max-width: 1100px; margin: 0 auto; padding: 18px; }

.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px; margin-bottom: 16px;
  background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow);
}
.header__wordmark { font-family: var(--font-structural); font-weight: 800; font-size: 26px; }
.header__round { font-family: var(--font-structural); letter-spacing: 0.08em; color: var(--ink-2); }
.header__status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--add); }
.dot--down { background: var(--you); }

.screen { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); padding: 28px; }
```

- [ ] **Step 3: Create `packages/client/src/components/Header.tsx`**

```tsx
import { useGame } from "../state/GameProvider.js";

export function Header() {
  const { state } = useGame();
  const live = state.connection.phase === "connected";
  const room = state.room;

  return (
    <header className="header">
      <div className="header__wordmark">eat.io</div>
      {room && (
        <div className="header__round">
          ROUND {room.roundIndex + 1} / {room.roundCount}
        </div>
      )}
      <div className="header__status">
        <span className={live ? "dot" : "dot dot--down"} />
        {live ? "Connected" : state.connection.phase === "reconnecting" ? "Reconnecting" : "Offline"}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Replace `packages/client/src/App.tsx`**

```tsx
import { Header } from "./components/Header.js";
import { GameProvider, useGame } from "./state/GameProvider.js";
import { selectScreen } from "./state/gameState.js";
import { ConnectScreen } from "./screens/ConnectScreen.js";
import { QueueScreen } from "./screens/QueueScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { GameOverScreen } from "./screens/GameOverScreen.js";

function CurrentScreen() {
  const { state } = useGame();
  switch (selectScreen(state)) {
    case "connect":
      return <ConnectScreen />;
    case "queue":
      return <QueueScreen />;
    case "game":
      return <GameScreen />;
    case "gameOver":
      return <GameOverScreen />;
  }
}

export function App() {
  return (
    <GameProvider>
      <div className="app">
        <Header />
        <CurrentScreen />
      </div>
    </GameProvider>
  );
}
```

- [ ] **Step 5: Update `packages/client/src/main.tsx` to load fonts and styles**

Add these imports above the existing ones:
```tsx
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "@fontsource/karla/400.css";
import "@fontsource/karla/600.css";
import "./styles/tokens.css";
import "./styles/app.css";
```

- [ ] **Step 6: Create placeholder screens so the app compiles**

Create each of `packages/client/src/screens/ConnectScreen.tsx`, `QueueScreen.tsx`, `GameScreen.tsx`, `GameOverScreen.tsx` with the same shape, changing only the name:

```tsx
export function ConnectScreen() {
  return <section className="screen">Connect</section>;
}
```

- [ ] **Step 7: Typecheck, build, and look at it**

Run: `npm run typecheck && npm run build --workspace @eat.io/client`
Expected: both succeed.
Run: `npm run dev:client` and open the printed URL. Expected: mint speckled background, the eat.io wordmark, an Offline dot, and the word "Connect".

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(client): design tokens, header, and screen routing"
```

---

### Task 10: Connect screen

The first real screen (§2.8.8): wordmark at 76px, tagline, name field, **server URL field** (never a hardcoded literal), and a Find a game button disabled until a name is entered.

**Files:**
- Create: `packages/client/src/styles/screens.css`
- Modify: `packages/client/src/screens/ConnectScreen.tsx`, `packages/client/src/main.tsx`

**Interfaces:**
- Consumes: `useGame` (Task 8); `initialServerUrl` (Task 1).

- [ ] **Step 1: Create `packages/client/src/styles/screens.css`**

```css
.connect { text-align: center; max-width: 460px; margin: 0 auto; }
.connect__wordmark { font-family: var(--font-structural); font-weight: 800; font-size: 76px; margin: 0; }
.connect__tagline { color: var(--ink-2); margin: 4px 0 26px; }
.field { display: block; text-align: left; margin-bottom: 14px; }
.field__label { display: block; font-family: var(--font-structural); font-size: 13px; color: var(--ink-2); margin-bottom: 5px; }
.field__input {
  width: 100%; padding: 12px 14px; font-family: var(--font-body); font-size: 15px;
  border: 2px solid var(--tray-border); border-radius: 10px; background: #fff; color: var(--ink);
}
.connect__explainer { margin-top: 24px; color: var(--ink-2); font-size: 14px; line-height: 1.5; }

.queue { text-align: center; padding: 40px 0; }
.queue__title { font-family: var(--font-structural); font-size: 24px; }
.queue__dots span { animation: blink 1.4s infinite; }
.queue__dots span:nth-child(2) { animation-delay: 0.2s; }
.queue__dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
.queue__bob { animation: bob 1.8s ease-in-out infinite; display: inline-block; }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
```

Add `import "./styles/screens.css";` to `main.tsx`.

- [ ] **Step 2: Implement `packages/client/src/screens/ConnectScreen.tsx`**

```tsx
import { useState } from "react";
import { initialServerUrl } from "../config.js";
import { useGame } from "../state/GameProvider.js";

export function ConnectScreen() {
  const { state, connect, setName } = useGame();
  const [serverUrl, setServerUrl] = useState(initialServerUrl());

  const ready = state.name.trim().length > 0 && serverUrl.trim().length > 0;

  return (
    <section className="screen connect">
      <h1 className="connect__wordmark">eat.io</h1>
      <p className="connect__tagline">a fun math game for all ages</p>

      <label className="field">
        <span className="field__label">Your name</span>
        <input
          className="field__input"
          value={state.name}
          maxLength={14}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Server</span>
        <input
          className="field__input"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
        />
      </label>

      <button disabled={!ready} onClick={() => connect(serverUrl.trim(), state.name.trim())}>
        Find a game
      </button>

      {state.connection.error && <p className="connect__explainer">{state.connection.error}</p>}

      <p className="connect__explainer">
        Trays of food travel down your lunch table. Whatever reaches the end gets eaten, and
        its number is added to your score. Play cards to pile more food onto a tray before it
        gets there. Most eaten when the rounds run out wins.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Verify against the real server**

Run the server in one terminal (`npm start`) and `npm run dev:client` in another. Enter a name and press Find a game.
Expected: the connection dot turns green and reads Connected; the screen switches away from Connect (a `welcome` arrived, so `identity` is set).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(client): connect screen with configurable server URL"
```

---

### Task 11: Queue screen

§2.8.8: a bobbing child, "Finding you a lunch buddy…" with staggered dots, the player's name, and Cancel. **Never dressed up as a board.**

**Files:**
- Modify: `packages/client/src/screens/QueueScreen.tsx`
- Depends on `<Child>` from Task 13 — until then it renders the text-only version below and Task 13 swaps the placeholder for the real child.

**Interfaces:**
- Consumes: `useGame` (Task 8).

- [ ] **Step 1: Implement `packages/client/src/screens/QueueScreen.tsx`**

```tsx
import { useGame } from "../state/GameProvider.js";

export function QueueScreen() {
  const { state, cancelQueue } = useGame();

  return (
    <section className="screen queue">
      <div className="queue__bob" aria-hidden="true">
        <span style={{ fontSize: 64 }}>🧒</span>
      </div>
      <h2 className="queue__title">
        Finding you a lunch buddy
        <span className="queue__dots">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </h2>
      <p>You are queued as {state.name}</p>
      {state.privateCode && <p>Private room code: {state.privateCode}</p>}
      <button onClick={cancelQueue}>Cancel</button>
    </section>
  );
}
```

Note: the emoji is a stand-in only. Task 13 replaces it with the `<Child>` component, which is the design's actual placeholder.

- [ ] **Step 2: Verify**

With the server running, connect and press Find a game with only one client.
Expected: the queue screen appears with the bobbing figure and animated dots; Cancel returns to Connect once `queueCancelled` arrives.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(client): queue screen with cancel"
```

---

### Task 12: Tray and food rendering

The tray itself: moulded plastic, wells, food shapes from Task 6, the `+N` overflow chip, and — required by §2.8.3 — **the exact value on a pill beneath every tray, on both tables**.

**Files:**
- Create: `packages/client/src/components/board/Food.tsx`, `packages/client/src/components/board/Tray.tsx`
- Create: `packages/client/src/styles/board.css`
- Modify: `packages/client/src/main.tsx`

**Interfaces:**
- Consumes: `layoutTray`, `YOUR_WELLS`, `OPPONENT_WELLS`, `FoodShape`, `Well` (Task 6); `TrayView` (protocol).
- Produces: `<Food shapes={FoodShape[]} />`; `<Tray tray={TrayView} variant="you" | "opponent" selected={boolean} order={number | null} onClick?={() => void} />`.

- [ ] **Step 1: Create `packages/client/src/styles/board.css`**

```css
.tray { position: relative; }
.tray__body {
  position: relative; display: flex; gap: 6px; padding: 8px;
  background: var(--tray-plastic); border: 2px solid var(--tray-border);
  border-radius: 12px; box-shadow: var(--shadow);
  transition: transform 160ms, box-shadow 160ms, outline-color 160ms;
  outline: 4px solid transparent; outline-offset: 2px;
}
.tray--you .tray__body { width: 130px; height: 104px; }
.tray--opponent .tray__body { width: 108px; height: 74px; }
.tray--clickable .tray__body { cursor: pointer; }
.tray--clickable:hover .tray__body { transform: translateY(-4px); }
.tray--selected .tray__body {
  transform: translateY(-9px); outline-color: var(--you); box-shadow: var(--shadow-deep);
}
.tray__well {
  position: relative; background: var(--well); border-radius: 8px;
  box-shadow: inset 0 3px 6px rgba(35, 42, 36, 0.18);
}
.tray__food { position: absolute; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.18); }
.tray__food--circle { border-radius: 50%; }
.tray__food--square { border-radius: 4px; }
.tray__overflow {
  position: absolute; top: 4px; right: 4px; padding: 1px 6px; border-radius: 999px;
  background: var(--ink); color: #fff; font-family: var(--font-structural); font-size: 11px;
}
.tray__value {
  display: block; margin: 6px auto 0; width: fit-content; padding: 2px 12px;
  border-radius: 999px; background: var(--surface); border: 2px solid var(--tray-border);
  font-family: var(--font-structural); font-weight: 800; font-size: 16px; text-align: center;
}
.tray--selected .tray__value { background: var(--you); color: #fff; border-color: var(--you); }
.tray__order {
  position: absolute; top: -10px; left: -10px; width: 24px; height: 24px; border-radius: 50%;
  background: var(--you); color: #fff; font-family: var(--font-structural); font-size: 13px;
  display: grid; place-items: center; box-shadow: var(--shadow);
}
```

Add `import "./styles/board.css";` to `main.tsx`.

- [ ] **Step 2: Implement `packages/client/src/components/board/Food.tsx`**

```tsx
import type { FoodShape } from "../../food/foodLayout.js";

export function Food({ shapes }: { shapes: FoodShape[] }) {
  return (
    <>
      {shapes.map((shape) => (
        <span
          key={shape.key}
          className={`tray__food tray__food--${shape.kind}`}
          style={{
            left: shape.x,
            top: shape.y,
            width: shape.size,
            height: shape.size,
            background: shape.color,
          }}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Implement `packages/client/src/components/board/Tray.tsx`**

```tsx
import type { TrayView } from "@eat.io/protocol";
import { layoutTray, OPPONENT_WELLS, YOUR_WELLS } from "../../food/foodLayout.js";
import { Food } from "./Food.js";

interface TrayProps {
  tray: TrayView;
  variant: "you" | "opponent";
  selected?: boolean;
  /** 1-based selection order, shown only for multi-target cards (§2.8.5). */
  order?: number | null;
  onClick?: () => void;
}

export function Tray({ tray, variant, selected = false, order = null, onClick }: TrayProps) {
  const wells = variant === "you" ? YOUR_WELLS : OPPONENT_WELLS;
  const laid = layoutTray(tray.id, tray.value, wells);

  const className = [
    "tray",
    `tray--${variant}`,
    selected ? "tray--selected" : "",
    onClick ? "tray--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div
        className="tray__body"
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(event) => {
          if (!onClick) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
      >
        {order !== null && <span className="tray__order">{order}</span>}
        {wells.map((well, index) => (
          <div
            key={index}
            className="tray__well"
            style={{ width: well.width, height: well.height }}
          >
            <Food shapes={laid.perWell[index] ?? []} />
          </div>
        ))}
        {laid.overflow > 0 && <span className="tray__overflow">+{laid.overflow}</span>}
      </div>
      {/* §2.8.3: the number is never only implied by the food. */}
      <span className="tray__value">{tray.value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): tray rendering with deterministic food and value pill"
```

---
### Task 13: The child

§2.8.6: flat geometry — hair cap, head, eyes, mouth, shirt in the seat's accent colour. Explicitly a **placeholder for real illustration**, so the one hard requirement is that **the mouth stays a separately animatable element**.

**Files:**
- Create: `packages/client/src/components/board/Child.tsx`
- Modify: `packages/client/src/screens/QueueScreen.tsx` (swap the emoji stand-in)
- Modify: `packages/client/src/styles/board.css`

**Interfaces:**
- Produces: `<Child accent="you" | "opponent" size="large" | "small" biting={boolean} />`.

- [ ] **Step 1: Implement `packages/client/src/components/board/Child.tsx`**

```tsx
/**
 * §2.8.6 — placeholder geometry for real illustration. Whatever replaces this MUST keep
 * the mouth as its own element so the chomp can animate independently.
 */
interface ChildProps {
  accent: "you" | "opponent";
  size?: "large" | "small";
  biting?: boolean;
}

export function Child({ accent, size = "large", biting = false }: ChildProps) {
  const large = size === "large";
  const width = large ? 112 : 96;
  const height = large ? 116 : 92;
  const shirt = accent === "you" ? "var(--you)" : "var(--opponent)";

  return (
    <svg
      className="child"
      width={width}
      height={height}
      viewBox="0 0 112 116"
      role="img"
      aria-label={accent === "you" ? "you, eating" : "your opponent, eating"}
    >
      <rect x="26" y="84" width="60" height="32" rx="14" fill={shirt} />
      <circle cx="56" cy="52" r="34" fill="#f2d3b3" />
      <path d="M22 46a34 34 0 0 1 68 0z" fill="#4a3a2c" />
      <circle cx="44" cy="50" r="4.5" fill="var(--ink)" />
      <circle cx="68" cy="50" r="4.5" fill="var(--ink)" />
      {/* The mouth: a thin closed line at rest, a rounded opening on a chomp. */}
      <ellipse
        className={biting ? "child__mouth child__mouth--open" : "child__mouth"}
        cx="56"
        cy="68"
        rx="11"
        ry={biting ? 9 : 1.4}
        fill="var(--reject)"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Add the mouth transition to `packages/client/src/styles/board.css`**

```css
.child__mouth { transition: ry 140ms ease-in-out; }
.child { display: block; }
```

- [ ] **Step 3: Replace the emoji in `QueueScreen.tsx`**

Swap the `<span style={{ fontSize: 64 }}>🧒</span>` for:
```tsx
        <Child accent="you" />
```
and add `import { Child } from "../components/board/Child.js";` at the top.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): placeholder child with an independently animatable mouth"
```

---

### Task 14: The two tables

§2.6 and §2.8.4 are emphatic: these are **separate components, not one behind an `isMine` flag**. Yours has hover, selection rings, order badges, and click handlers; the opponent's has none of those, uses the smaller two-well tray, and shows a hand *count*. Both run left to right with the child at the right end and the score beneath it.

**Files:**
- Create: `packages/client/src/components/board/YourTable.tsx`, `OpponentTable.tsx`, `Board.tsx`
- Modify: `packages/client/src/styles/board.css`

**Interfaces:**
- Consumes: `Tray` (Task 12), `Child` (Task 13); `RoomStateMessage` (protocol); `Selection` (Task 5).
- Produces: `<YourTable you={RoomStateMessage["you"]} selection={Selection} targetCount={number} onTrayClick={(trayId: string) => void} biting={boolean} />`; `<OpponentTable opponent={RoomStateMessage["opponent"]} biting={boolean} />`; `<Board room={RoomStateMessage} ... />`.

- [ ] **Step 1: Add table styles to `packages/client/src/styles/board.css`**

```css
.board { overflow-x: auto; padding-bottom: 8px; }
.board__inner { min-width: 900px; }

.table-strip { display: flex; align-items: flex-end; gap: 18px; padding: 10px 0; }
.table-strip__trays { position: relative; display: flex; gap: 16px; }
.table-strip__edge { flex: 1; height: 10px; background: var(--table-edge); border: 2px solid var(--table-edge-border); border-radius: 6px; }
.table-strip__end { text-align: center; }
.table-strip__score {
  font-family: var(--font-structural); font-weight: 800; font-size: 30px;
  transition: transform 320ms;
}
.table-strip__score-label { font-family: var(--font-structural); font-size: 11px; letter-spacing: 0.1em; color: var(--ink-2); }

.seat-line { display: flex; align-items: center; gap: 10px; font-family: var(--font-structural); }
.seat-chip { width: 12px; height: 12px; border-radius: 3px; }
.seat-chip--you { background: var(--you); }
.seat-chip--opponent { background: var(--opponent); }
.seat-line__ready { padding: 2px 10px; border-radius: 999px; background: var(--add); color: #fff; font-size: 12px; }
.board__divider { border: none; border-top: 2px dashed var(--tray-border); margin: 14px 0; }
```

- [ ] **Step 2: Implement `packages/client/src/components/board/OpponentTable.tsx`**

```tsx
import type { RoomStateMessage } from "@eat.io/protocol";
import { Child } from "./Child.js";
import { Tray } from "./Tray.js";

type Opponent = RoomStateMessage["opponent"];

/** Read-only by construction: no click handlers, no selection, no hand contents. */
export function OpponentTable({ opponent, biting }: { opponent: Opponent; biting: boolean }) {
  return (
    <div>
      <div className="seat-line">
        <span className="seat-chip seat-chip--opponent" />
        <strong>{opponent.name}</strong>
        <span>{opponent.handCount} cards in hand</span>
        {opponent.submitted && <span className="seat-line__ready">READY</span>}
      </div>
      <div className="table-strip">
        <div className="table-strip__trays">
          {opponent.table.map((tray) => (
            <Tray key={tray.id} tray={tray} variant="opponent" />
          ))}
        </div>
        <div className="table-strip__edge" />
        <div className="table-strip__end">
          <Child accent="opponent" size="small" biting={biting} />
          <div className="table-strip__score">{opponent.score}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `packages/client/src/components/board/YourTable.tsx`**

```tsx
import type { RoomStateMessage } from "@eat.io/protocol";
import type { Selection } from "../../state/selection.js";
import { Child } from "./Child.js";
import { Tray } from "./Tray.js";

type You = RoomStateMessage["you"];

interface YourTableProps {
  you: You;
  selection: Selection;
  /** How many targets the selected card takes; order badges show only when > 1. */
  targetCount: number;
  onTrayClick: (trayId: string) => void;
  biting: boolean;
}

export function YourTable({ you, selection, targetCount, onTrayClick, biting }: YourTableProps) {
  return (
    <div>
      <div className="seat-line">
        <span className="seat-chip seat-chip--you" />
        <strong>{you.name}</strong>
        <span>your table</span>
        {you.submitted && <span className="seat-line__ready">READY</span>}
      </div>
      <div className="table-strip">
        <div className="table-strip__trays">
          {you.table.map((tray) => {
            const position = selection.targetTrayIds.indexOf(tray.id);
            return (
              <Tray
                key={tray.id}
                tray={tray}
                variant="you"
                selected={position >= 0}
                order={position >= 0 && targetCount > 1 ? position + 1 : null}
                onClick={() => onTrayClick(tray.id)}
              />
            );
          })}
        </div>
        <div className="table-strip__edge" />
        <div className="table-strip__end">
          <Child accent="you" biting={biting} />
          <div className="table-strip__score">{you.score}</div>
          <div className="table-strip__score-label">EATEN</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `packages/client/src/components/board/Board.tsx`**

```tsx
import type { RoomStateMessage } from "@eat.io/protocol";
import type { Selection } from "../../state/selection.js";
import { OpponentTable } from "./OpponentTable.js";
import { YourTable } from "./YourTable.js";

interface BoardProps {
  room: RoomStateMessage;
  selection: Selection;
  targetCount: number;
  onTrayClick: (trayId: string) => void;
  biting: boolean;
  frozen: boolean;
}

export function Board({ room, selection, targetCount, onTrayClick, biting, frozen }: BoardProps) {
  return (
    <div className={frozen ? "board board--frozen" : "board"}>
      <div className="board__inner">
        <OpponentTable opponent={room.opponent} biting={biting} />
        <hr className="board__divider" />
        <YourTable
          you={room.you}
          selection={selection}
          targetCount={targetCount}
          onTrayClick={onTrayClick}
          biting={biting}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): separate interactive and read-only tables"
```

---

### Task 15: Hand, cards, status pill, and the playable game screen

The turn grammar from §2.8.5 wired end to end. After this task the game is **playable against the real server** — which is how everything visual gets verified from here on.

**Files:**
- Create: `packages/client/src/components/hand/Card.tsx`, `Hand.tsx`, `StatusPill.tsx`
- Create: `packages/client/src/styles/hand.css`
- Modify: `packages/client/src/screens/GameScreen.tsx`, `packages/client/src/main.tsx`

**Interfaces:**
- Consumes: `Board` (Task 14); `selection.ts` (Task 5); `selectAwaitingYou`, `selectBoardFrozen`, `selectYourCard` (Task 3); `useGame` (Task 8); `CardView` (protocol).
- Produces: `<Card card={CardView} selected={boolean} onClick={() => void} />`; `<Hand cards={CardView[]} selectedId={string | null} onSelect={(id: string) => void} />`; `<StatusPill text={string} ready={boolean} />`.

- [ ] **Step 1: Create `packages/client/src/styles/hand.css`**

```css
.hand { display: flex; gap: 12px; flex-wrap: wrap; }
.card {
  width: 118px; height: 156px; padding: 0; overflow: hidden;
  background: var(--surface); border: 2px solid var(--tray-border); border-radius: 12px;
  box-shadow: var(--shadow); color: var(--ink); text-align: left;
  display: flex; flex-direction: column;
  transition: transform 160ms, box-shadow 160ms, border-color 160ms;
}
.card:hover { transform: translateY(-6px); }
.card--selected { transform: translateY(-12px); border-color: var(--you); box-shadow: var(--shadow-deep); }
.card__strip {
  height: 44px; display: grid; place-items: center; color: #fff;
  font-family: var(--font-structural); font-weight: 800; font-size: 22px;
}
.card__strip--add { background: var(--add); }
.card__strip--multiply { background: var(--multiply); }
.card__name { flex: 1; padding: 8px 10px; font-family: var(--font-body); font-size: 12px; line-height: 1.3; }
.card__footer { padding: 6px 10px; border-top: 2px solid var(--tray-border); font-size: 11px; color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.card__pip { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); display: inline-block; }

.turnbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 18px 0 12px; }
.status-pill {
  padding: 8px 18px; border-radius: 999px; background: var(--surface);
  border: 2px solid var(--tray-border); font-family: var(--font-structural); font-size: 14px;
}
.status-pill--ready { background: var(--add); border-color: var(--add); color: #fff; }
.board--frozen { opacity: 0.45; filter: saturate(0.4); pointer-events: none; }
```

Add `import "./styles/hand.css";` to `main.tsx`.

- [ ] **Step 2: Implement `packages/client/src/components/hand/Card.tsx`**

```tsx
import type { CardView } from "@eat.io/protocol";

/** Everything shown comes from server data — no switch over card ids (§0.9). */
export function Card({
  card,
  selected,
  onClick,
}: {
  card: CardView;
  selected: boolean;
  onClick: () => void;
}) {
  const glyph = card.action === "add" ? `+${card.amount}` : `×${card.amount}`;

  return (
    <button
      className={selected ? "card card--selected" : "card"}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className={`card__strip card__strip--${card.action}`}>{glyph}</span>
      <span className="card__name">{card.name}</span>
      <span className="card__footer">
        {card.targets} {card.targets === 1 ? "tray" : "trays"}
        {Array.from({ length: card.targets }, (_, index) => (
          <span key={index} className="card__pip" />
        ))}
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Implement `packages/client/src/components/hand/Hand.tsx`**

```tsx
import type { CardView } from "@eat.io/protocol";
import { Card } from "./Card.js";

export function Hand({
  cards,
  selectedId,
  onSelect,
}: {
  cards: CardView[];
  selectedId: string | null;
  onSelect: (cardId: string) => void;
}) {
  return (
    <div className="hand">
      {cards.map((card, index) => (
        // Card ids repeat across a hand (the deck holds duplicates), so the key pairs
        // the id with its slot.
        <Card
          key={`${card.id}:${index}`}
          card={card}
          selected={selectedId === card.id}
          onClick={() => onSelect(card.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `packages/client/src/components/hand/StatusPill.tsx`**

```tsx
export function StatusPill({ text, ready }: { text: string; ready: boolean }) {
  return <span className={ready ? "status-pill status-pill--ready" : "status-pill"}>{text}</span>;
}
```

- [ ] **Step 5: Implement `packages/client/src/screens/GameScreen.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Board } from "../components/board/Board.js";
import { Hand } from "../components/hand/Hand.js";
import { StatusPill } from "../components/hand/StatusPill.js";
import { useGame } from "../state/GameProvider.js";
import {
  selectAwaitingYou,
  selectBoardFrozen,
  selectYourCard,
} from "../state/gameState.js";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
  type Selection,
} from "../state/selection.js";

export function GameScreen() {
  const { state, submitTurn } = useGame();
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const room = state.room;

  // A resolved round replaces the hand, so last round's choice must not linger.
  useEffect(() => {
    setSelection(emptySelection);
  }, [room?.roundIndex]);

  if (!room) return null;

  const card = selectYourCard(state, selection.cardId);
  const targetCount = card?.targets ?? 0;
  const awaitingYou = selectAwaitingYou(state);
  const ready = isSubmittable(selection, targetCount);

  const status = !awaitingYou
    ? "Waiting for your opponent"
    : !selection.cardId
      ? "Your move — pick a card"
      : !ready
        ? `Now tap ${targetCount} ${targetCount === 1 ? "tray" : "trays"}`
        : "Ready — end your turn";

  return (
    <section className="screen">
      <Board
        room={room}
        selection={selection}
        targetCount={targetCount}
        biting={false}
        frozen={selectBoardFrozen(state)}
        onTrayClick={(trayId) => {
          const result = toggleTray(selection, trayId, targetCount);
          setSelection(result.selection);
          // `needsCardFirst` raises the toast in Task 17; until then it is simply ignored.
        }}
      />

      <div className="turnbar">
        <StatusPill text={status} ready={ready} />
        <button
          disabled={!ready || !awaitingYou}
          onClick={() => {
            if (!selection.cardId) return;
            submitTurn(selection.cardId, selection.targetTrayIds);
            setSelection(emptySelection);
          }}
        >
          End turn
        </button>
      </div>

      <Hand
        cards={room.you.hand}
        selectedId={selection.cardId}
        onSelect={(cardId) => setSelection(selectCard(selection, cardId))}
      />
    </section>
  );
}
```

- [ ] **Step 6: Play a real game**

Run `npm start` in one terminal and `npm run dev:client` in another. Open the client in **two browser windows**, name both, and press Find a game in each.
Expected: both land on a board; picking a card lifts it; tapping a tray rings it and turns its pill tomato; End turn is grey until a card and exactly its target count of trays are chosen; after both submit, the round advances, scores rise, and hands refresh. Ten rounds later the screen goes blank — Task 16 builds Game Over.

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): playable game screen — hand, selection, and end turn"
```

---
### Task 16: Game over screen

§2.8.8: a large result badge, a scorecard with the winning row outlined, and two exits that both fully reset game state (§2.5). **A draw is a first-class result with its own colour and copy** (§0.7) — never a missing winner.

**Files:**
- Modify: `packages/client/src/screens/GameOverScreen.tsx`, `packages/client/src/styles/screens.css`

**Interfaces:**
- Consumes: `useGame` (Task 8); `Result` (protocol).

- [ ] **Step 1: Add styles to `packages/client/src/styles/screens.css`**

```css
.over { text-align: center; }
.over__badge {
  display: inline-block; padding: 18px 34px; border-radius: var(--radius);
  font-family: var(--font-structural); font-weight: 800; font-size: 28px; color: #fff;
  box-shadow: var(--shadow); margin-bottom: 22px;
}
.over__badge--win { background: var(--add); }
.over__badge--loss { background: var(--opponent); }
.over__badge--draw { background: var(--multiply); }
.over__card { margin: 0 auto 24px; border-collapse: collapse; min-width: 280px; }
.over__card th, .over__card td {
  padding: 10px 18px; font-family: var(--font-structural); text-align: left;
  border-bottom: 2px solid var(--tray-border);
}
.over__row--winner { outline: 3px solid var(--add); background: rgba(95, 158, 74, 0.12); }
.over__actions { display: flex; gap: 12px; justify-content: center; }
.over__actions button.secondary { background: var(--ink-2); }
```

- [ ] **Step 2: Implement `packages/client/src/screens/GameOverScreen.tsx`**

```tsx
import { useGame } from "../state/GameProvider.js";

export function GameOverScreen() {
  const { state, playAgain, leaveToMenu } = useGame();
  const result = state.result;
  const room = state.room;
  if (!result || !room) return null;

  const opponentName = room.opponent.name;
  const headline =
    result.kind === "win"
      ? "You ate the most"
      : result.kind === "loss"
        ? `${opponentName} ate the most`
        : "Dead even";

  const rows = [
    { seat: room.you.seat, name: room.you.name, score: result.scores[room.you.seat] ?? 0 },
    { seat: room.opponent.seat, name: opponentName, score: result.scores[room.opponent.seat] ?? 0 },
  ];
  const best = Math.max(...rows.map((row) => row.score));

  return (
    <section className="screen over">
      <div className={`over__badge over__badge--${result.kind}`}>{headline}</div>

      <table className="over__card">
        <thead>
          <tr>
            <th>Player</th>
            <th>Eaten</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.seat}
              /* On a draw both rows tie for best, so both are outlined — correct. */
              className={row.score === best ? "over__row--winner" : undefined}
            >
              <td>{row.name}</td>
              <td>{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="over__actions">
        <button onClick={playAgain}>Play again</button>
        <button className="secondary" onClick={leaveToMenu}>
          Back to menu
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify a full game end to end**

Play a ten-round game in two windows.
Expected: the badge reads "You ate the most" in one window and "<name> ate the most" in the other, the higher row is outlined in both, **Play again** returns both players to the queue and starts a genuinely fresh board (round 1, scores 0), and **Back to menu** returns to Connect with the name still filled in.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(client): game over screen with a first-class draw"
```

---

### Task 17: Overlays — rejection, connection loss, opponent dropped

§2.8.9's three designed unhappy paths. All three are overlays on the current screen, not screens, so a paused board stays visible behind them.

**Files:**
- Create: `packages/client/src/components/overlays/RejectionToast.tsx`, `ConnectionLostBanner.tsx`, `OpponentDroppedModal.tsx`
- Create: `packages/client/src/styles/overlays.css`
- Modify: `packages/client/src/App.tsx`, `packages/client/src/screens/GameScreen.tsx`, `packages/client/src/main.tsx`

**Interfaces:**
- Consumes: `useGame` (Task 8); `Rejection` (Task 3).
- Produces: `<RejectionToast>`, `<ConnectionLostBanner>`, `<OpponentDroppedModal>` — each reads context and renders nothing when not applicable.

- [ ] **Step 1: Create `packages/client/src/styles/overlays.css`**

```css
.banner {
  background: var(--multiply); color: var(--ink); font-family: var(--font-structural);
  padding: 12px 18px; border-radius: var(--radius); margin-bottom: 14px; box-shadow: var(--shadow);
}

.toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(16px);
  display: flex; gap: 12px; align-items: flex-start; max-width: 420px;
  background: var(--you); color: #fff; padding: 14px 18px; border-radius: var(--radius);
  box-shadow: var(--shadow-deep); animation: toast-in 180ms ease-out forwards;
}
@keyframes toast-in { to { transform: translateX(-50%) translateY(0); } }
.toast__disc {
  width: 26px; height: 26px; border-radius: 50%; background: #fff; color: var(--you);
  display: grid; place-items: center; font-family: var(--font-structural); font-weight: 800;
  flex: none;
}
.toast__heading { font-family: var(--font-structural); font-weight: 700; }

.modal-scrim { position: fixed; inset: 0; background: rgba(35, 42, 36, 0.55); display: grid; place-items: center; }
.modal {
  background: var(--surface); padding: 28px; border-radius: var(--radius);
  box-shadow: var(--shadow-deep); max-width: 420px; text-align: center;
}
.modal__bar { height: 10px; border-radius: 999px; background: var(--tray-border); overflow: hidden; margin: 16px 0; }
.modal__bar span { display: block; height: 100%; background: var(--multiply); transition: width 200ms linear; }
```

Add `import "./styles/overlays.css";` to `main.tsx`.

- [ ] **Step 2: Implement `packages/client/src/components/overlays/RejectionToast.tsx`**

```tsx
import { useEffect } from "react";
import { useGame } from "../../state/GameProvider.js";

const HOLD_MS = 3400;

export function RejectionToast() {
  const { state, dismissRejection } = useGame();
  const rejection = state.rejection;
  const seq = rejection?.seq ?? null;

  // Keyed on seq, so a repeat of the same code restarts the timer rather than being lost.
  useEffect(() => {
    if (seq === null) return;
    const timer = setTimeout(dismissRejection, HOLD_MS);
    return () => clearTimeout(timer);
  }, [seq, dismissRejection]);

  if (!rejection) return null;

  return (
    <div className="toast" role="alert">
      <span className="toast__disc">!</span>
      <span>
        <span className="toast__heading">Move rejected</span>
        <br />
        {rejection.message}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Implement `packages/client/src/components/overlays/ConnectionLostBanner.tsx`**

```tsx
import { useGame } from "../../state/GameProvider.js";

export function ConnectionLostBanner() {
  const { state } = useGame();
  if (!state.identity) return null;
  if (state.connection.phase === "connected") return null;

  return (
    <div className="banner" role="status">
      Connection lost — reconnecting. The board below is frozen and may be out of date.
    </div>
  );
}
```

- [ ] **Step 4: Implement `packages/client/src/components/overlays/OpponentDroppedModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useGame } from "../../state/GameProvider.js";

export function OpponentDroppedModal() {
  const { state, leaveRoom } = useGame();
  const dropped = state.opponentDropped;
  const ended = state.room?.phase === "abandoned";
  const graceEndsAt = dropped?.graceEndsAt ?? null;
  const [remaining, setRemaining] = useState(1);

  // A clock belongs here, in a view, never in the reducer.
  useEffect(() => {
    if (graceEndsAt === null) return;
    const started = Date.now();
    const span = Math.max(1, graceEndsAt - started);
    const tick = setInterval(() => {
      setRemaining(Math.max(0, (graceEndsAt - Date.now()) / span));
    }, 200);
    return () => clearInterval(tick);
  }, [graceEndsAt]);

  if (!dropped && !ended) return null;
  const opponentName = state.room?.opponent.name ?? "Your opponent";

  return (
    <div className="modal-scrim">
      <div className="modal" role="dialog" aria-modal="true">
        {ended ? (
          <p>
            <strong>{opponentName} has left the lunchroom</strong>
            <br />
            No result is recorded.
          </p>
        ) : (
          <>
            <p>
              <strong>{opponentName} dropped out</strong> — holding their seat for a moment.
              <br />
              The table is paused, not ended.
            </p>
            <div className="modal__bar">
              <span style={{ width: `${Math.round(remaining * 100)}%` }} />
            </div>
          </>
        )}
        <button onClick={leaveRoom}>Leave game</button>
      </div>
    </div>
  );
}
```

Note on the clock: `graceEndsAt` is server epoch-ms. If the two clocks are skewed the bar drains inaccurately; that is recorded as a known limitation in Task 19's README rather than papered over.

- [ ] **Step 5: Mount the overlays in `packages/client/src/App.tsx`**

Inside `<div className="app">`, after `<Header />`:
```tsx
        <ConnectionLostBanner />
        <CurrentScreen />
        <RejectionToast />
        <OpponentDroppedModal />
```
with imports for all three added at the top. Remove the standalone `<CurrentScreen />` that was there before so it appears exactly once.

- [ ] **Step 6: Raise the toast on a card-less tray click in `GameScreen.tsx`**

The `onTrayClick` handler currently discards `needsCardFirst`. §2.8.5 step 4 says the click must explain itself rather than silently fail. Replace the handler with:

```tsx
        onTrayClick={(trayId) => {
          const result = toggleTray(selection, trayId, targetCount);
          if (result.needsCardFirst) {
            noteCardFirst();
            return;
          }
          setSelection(result.selection);
        }}
```

and add this local rejection above the return, so the message uses the same toast without inventing a server code:

```tsx
  const { state, submitTurn, noteLocalRejection } = useGame();
  ...
  const noteCardFirst = () =>
    noteLocalRejection("Pick a card first — the card decides how many trays you may target.");
```

`noteLocalRejection` already exists on `GameApi` from Task 8 — it dispatches a
`localRejection` action, which the reducer marks `code: "LOCAL"` so a client-side
complaint is never mistaken for one the server sent.

- [ ] **Step 7: Verify all three paths**

- **Rejection:** click a tray before picking a card. Expected: the tomato toast appears and fades after ~3.4s.
- **Connection loss:** stop the server mid-game. Expected: amber banner, board at 45% opacity and non-interactive, header dot tomato reading Reconnecting. Restart the server; the client reconnects with its token and the board comes back live.
- **Opponent dropped:** close one browser window mid-game. Expected: the other sees the modal with a draining bar; after the 30s grace the copy switches to "has left the lunchroom".

- [ ] **Step 8: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): rejection toast, connection banner, opponent-dropped modal"
```

---

### Task 18: Motion

§2.8.7. Motion is a **function of state, never a delay before adopting it** — server state is applied the instant it arrives and these are transforms over already-current data.

**Files:**
- Create: `packages/client/src/components/board/useEatenTrays.ts`
- Modify: `packages/client/src/components/board/YourTable.tsx`, `OpponentTable.tsx`, `Tray.tsx`, `packages/client/src/styles/board.css`

**Interfaces:**
- Produces: `useEatenTrays(trays: TrayView[]): { rendered: TrayView[]; eatenIds: Set<string>; biting: boolean }` — keeps a departed tray in the list for 600ms flagged as eaten, and reports a bite while it leaves.

- [ ] **Step 1: Implement `packages/client/src/components/board/useEatenTrays.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import type { TrayView } from "@eat.io/protocol";

const EATEN_HOLD_MS = 600;

/**
 * §2.8.7 — the departing tray is kept for 600ms flagged as eaten so it can animate into
 * the child. State itself is never delayed: `trays` is always the server's current list;
 * this only *adds* the ghost of the one that just left.
 */
export function useEatenTrays(trays: TrayView[]): {
  rendered: TrayView[];
  eatenIds: Set<string>;
  biting: boolean;
} {
  const previous = useRef<TrayView[]>(trays);
  const [ghosts, setGhosts] = useState<TrayView[]>([]);

  useEffect(() => {
    const currentIds = new Set(trays.map((tray) => tray.id));
    const departed = previous.current.filter((tray) => !currentIds.has(tray.id));
    previous.current = trays;
    if (departed.length === 0) return;

    setGhosts((existing) => [...existing, ...departed]);
    const departedIds = new Set(departed.map((tray) => tray.id));
    const timer = setTimeout(() => {
      setGhosts((existing) => existing.filter((tray) => !departedIds.has(tray.id)));
    }, EATEN_HOLD_MS);
    return () => clearTimeout(timer);
  }, [trays]);

  return {
    rendered: [...ghosts, ...trays],
    eatenIds: new Set(ghosts.map((tray) => tray.id)),
    biting: ghosts.length > 0,
  };
}
```

- [ ] **Step 2: Add motion styles to `packages/client/src/styles/board.css`**

```css
.table-strip__trays { height: 130px; }
.tray {
  position: absolute; left: 0; top: 0;
  transition: transform 420ms cubic-bezier(.34, 1.2, .5, 1), opacity 420ms;
}
.tray--eaten { opacity: 0; transform: translateX(var(--slot-x)) scale(0.15); }
.tray--fresh { animation: tray-in 420ms ease-out; }
@keyframes tray-in { from { opacity: 0; } to { opacity: 1; } }
.table-strip__score { display: inline-block; }
.table-strip__score--pop { animation: score-pop 320ms ease-out; }
@keyframes score-pop { 0% { transform: scale(1); } 45% { transform: scale(1.35); } 100% { transform: scale(1); } }
```

- [ ] **Step 3: Position trays by index in `Tray.tsx`**

Add a `slot` prop and drive the transform from it — tray *i* from the front sits at `translateX((n-1-i) * 146px)` (§2.8.7):

```tsx
interface TrayProps {
  tray: TrayView;
  variant: "you" | "opponent";
  slot: number;        // index from the front
  count: number;       // how many trays are on the table
  eaten?: boolean;
  selected?: boolean;
  order?: number | null;
  onClick?: () => void;
}
```
and on the outer `<div className={className}>` add:
```tsx
      style={{
        transform: `translateX(${(count - 1 - slot) * 146}px)`,
        ["--slot-x" as string]: `${(count - 1 - slot) * 146}px`,
      }}
```
adding `eaten ? "tray--eaten" : ""` to the class list.

- [ ] **Step 4: Use the hook in both tables**

In `YourTable.tsx` and `OpponentTable.tsx`, replace the direct `.map` over `table` with:

```tsx
  const { rendered, eatenIds, biting: chewing } = useEatenTrays(you.table); // or opponent.table
```
map over `rendered`, pass `slot={index}`, `count={rendered.length}`, `eaten={eatenIds.has(tray.id)}`, and pass `chewing || biting` down to `<Child>`.

- [ ] **Step 5: Pop the score on change**

In both tables, track the previous score in a ref and add `table-strip__score--pop` for one render when it increases, keyed off the score value so the animation restarts each time.

- [ ] **Step 6: Verify**

Play a round in two windows.
Expected: on resolution the front tray shrinks into the child while the mouth opens and closes, the remaining trays slide right with a slight overshoot, a new tray fades in at the far end, and the score pops. Nothing else animates, and no value is ever stale — the numbers change the instant the server sends them.

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(client): advance, eaten, bite, and score motion"
```

---

### Task 19: README, open questions, and final gates

The §2.7 deliverables, plus the whole-suite check.

**Files:**
- Create: `packages/client/README.md`
- Modify: `README.md` (root)

- [ ] **Step 1: Write `packages/client/README.md`**

Cover, in this order: what it is; the stack choices **and why** (Vite over CRA which is deprecated; native `WebSocket` over the `websocket` package; a pure reducer over a store library, with the §2.4 reasoning; hand-written CSS over a framework because §2.8 is bespoke); how to run it against a local server (`npm start` then `npm run dev:client`, and `VITE_SERVER_URL` for anything else); the three-layer layout; and known limitations.

Known limitations to list:
- Session token is held in memory only — a page reload starts a new session and forfeits the seat.
- The opponent-dropped bar assumes client and server clocks agree, since `graceEndsAt` is server epoch-ms.
- No component or visual tests; logic only (§2.2).
- The child is placeholder geometry, not illustration (§2.8.6).
- No spectator mode, chat, or replays.

- [ ] **Step 2: Write the open-questions list**

§2.7 requires recording where `PROTOCOL.md` was silent rather than deciding unilaterally. Include at least:
- `roomState.deadlineAt` is delivered but not currently surfaced; the design's status pill describes whose turn it is rather than counting down. Should a visible turn clock be added?
- Nothing in the protocol distinguishes "the opponent left voluntarily" from "their grace window expired" — both arrive as `phase: "abandoned"`. The modal therefore uses one wording for both.
- `queueJoin` after `gameOver` is how "Play again" is expressed; the protocol has no explicit rematch message.

- [ ] **Step 3: Add a Client section to the root `README.md`**

Point at `packages/client`, and update the quickstart to show the server and client running together.

- [ ] **Step 4: Final gates**

Run: `npm test && npm run typecheck && npm run build --workspace @eat.io/client`
Expected: all tests pass, typecheck exits 0, production build succeeds.

Then play one complete game in two browser windows, including: a rejected move, a disconnect and reconnect, and Play again.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(client): README, stack rationale, and open questions"
```

---

## Self-Review

Run after implementing all tasks:

1. **Spec coverage** — §3 layout → Task 1; §4 layers → Tasks 2, 4, 7, 8; §5 state → Tasks 3, 4; §6 selection → Task 5; §7 session flow → Tasks 10, 11, 15, 16; §8 visual → Tasks 9, 12, 13, 14, 15; §9 motion → Task 18; §10 unhappy paths → Task 17; §11 error handling → Tasks 4, 7, 17; §12 config → Task 1; §13 testing → Tasks 2–6; §14 deliverables → Task 19.
2. **Placeholder scan** — no `TODO`/`TBD` in source; deferrals live in the README's known limitations.
3. **Constraint audit** — grep for the things the brief forbids: `isMine`, a `switch` over card ids, any hardcoded tray count or hand size, `setTimeout` wrapping a state update, a module-scope `new WebSocket`, and `any` on protocol-shaped values. All should return nothing.
4. **Final gates** — `npm test`, `npm run typecheck`, `npm run build --workspace @eat.io/client`, and one full two-window game.
