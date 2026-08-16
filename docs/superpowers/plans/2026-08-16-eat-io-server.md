# eat.io Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authoritative eat.io WebSocket game server and its shared `@eat.io/protocol` module — many concurrent two-player rooms, strict validated protocol, pure game engine, reconnection.

**Architecture:** An npm-workspaces monorepo. `@eat.io/protocol` holds zod schemas that are the single source of truth for both wire validation and TS types. The server is four layers with dependencies pointing downward only — Transport (ws + schema validation + heartbeats) → Session (one client) → Lobby/Room (registry, matchmaking, lifecycle, broadcast, timers) → Game Engine (pure `(state, playerId, action) → { state, events }`, no I/O, no globals).

**Tech Stack:** Node 22, TypeScript (strict, ESM), `ws`, `zod`, `vitest` for tests, `tsx` for running/dev.

**Spec:** `docs/superpowers/specs/2026-08-16-eat-io-server-design.md` (read it alongside this plan; section refs like §0.8 point into `REBUILD.md`, preserved at `/Users/briankruse/sandbox/eat.io-design-export/REBUILD.md`).

## Global Constraints

- **TypeScript strict mode**, no `any` at any boundary that touches the protocol.
- **ESM** modules (`"type": "module"`), Node **22+** (installed: v22.22.3).
- **zod schemas are the single source of truth** — every TS message type is `z.infer`red from its schema; never hand-declare a message type.
- **No module-level mutable game state.** All state hangs off a room instance held in a registry.
- **Per-player logic is written once over the players collection** — never `playerOne`/`playerTwo`, never positional `clients[0]`/`clients[1]`.
- **The engine is pure:** no socket types, no `setTimeout`, no direct `Date`/`Math.random` — clock and RNG are injected. A full game must run in a plain loop with no server.
- **Vocabulary:** `table`, `tray`, `eaten`, `card`, `hand`, `deck`, `round`, `room`, `seat`, `opponent`. Never `plate`.
- **Hidden info is absent from payloads**, never merely hidden by the UI.
- **Every client action gets an explicit response** (accepted or typed rejection). No silent drops.
- **No dead code, no commented-out alternatives, no TODO** as the only handling for a real case. Genuine deferrals → README known-limitations.
- **Commits:** conventional-commit style messages; **no Claude/Anthropic branding or co-author trailer** (user rule).

---

## File Structure

```
eat.io/
  package.json                     # workspaces root; scripts
  tsconfig.base.json               # strict/ESM base
  packages/
    protocol/
      package.json                 # name @eat.io/protocol, exports ./dist
      tsconfig.json
      src/
        version.ts                 # PROTOCOL_VERSION
        enums.ts                   # CardAction, RoomPhase, RejectionCode, ResultKind, Seat
        messages.ts                # all zod schemas, both directions + ClientMessage/ServerMessage unions
        index.ts                   # barrel: re-export schemas + inferred types
      test/
        messages.test.ts
    server/
      package.json                 # name @eat.io/server; depends on @eat.io/protocol
      tsconfig.json
      src/
        config.ts                  # env -> typed Config
        logger.ts                  # leveled structured logger
        util/
          rng.ts                   # pure seeded PRNG
        engine/
          state.ts                 # domain types: Card, Tray, PlayerState, GameState
          rules/
            content.ts             # PROVISIONAL cards + tuning (data only)
            index.ts               # Rules interface + default impl
          deal.ts                  # initial deal (table, hand, deck)
          engine.ts                # validateAction/applyAction/autoMove/everyoneSubmitted/resolveRound/isGameOver/rankResult
          viewFor.ts               # per-player projection
        session/
          session.ts               # Session: id, token, connected, send queue
        lobby/
          timers.ts                # Timers interface (schedule/cancel) + real impl
          room.ts                  # Room: wraps GameState, drives turns/timers/broadcast
          registry.ts              # RoomRegistry: many rooms, reaping
          matchmaking.ts           # public queue + private code
        transport/
          server.ts                # ws server: accept, decode+validate, heartbeat, route
        index.ts                   # composition root: wire everything, start, graceful shutdown
      test/
        rng.test.ts
        rules.test.ts
        deal.test.ts
        engine.validate.test.ts
        engine.resolve.test.ts
        engine.endgame.test.ts
        viewFor.test.ts
        fullGame.test.ts
        config.test.ts
        session.test.ts
        registry.test.ts
        matchmaking.test.ts
        room.test.ts
        reconnect.test.ts
      PROTOCOL.md                  # self-contained protocol doc
      README.md
```

---

### Task 1: Monorepo scaffold + tooling

Stands up the workspace, TypeScript (strict/ESM), and vitest so later tasks have a green `test`/`typecheck` to build on. Setup is folded in here; the deliverable is "install, typecheck, and one trivial test all pass."

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/protocol/package.json`, `packages/protocol/tsconfig.json`
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/protocol/src/version.ts`, `packages/protocol/test/version.test.ts`

**Interfaces:**
- Produces: workspace layout; `@eat.io/protocol` resolvable from `@eat.io/server`; `PROTOCOL_VERSION: number` exported from `@eat.io/protocol/version`.

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "eat.io",
  "private": true,
  "type": "module",
  "workspaces": ["packages/protocol", "packages/server"],
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx watch packages/server/src/index.ts",
    "start": "tsx packages/server/src/index.ts"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "composite": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: protocol package files**

`packages/protocol/package.json`:
```json
{
  "name": "@eat.io/protocol",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "zod": "^3.23.0" }
}
```

`packages/protocol/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: server package files**

`packages/server/package.json`:
```json
{
  "name": "@eat.io/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": { "build": "tsc -b" },
  "dependencies": { "@eat.io/protocol": "*", "ws": "^8.18.0", "zod": "^3.23.0" },
  "devDependencies": { "@types/ws": "^8.5.0" }
}
```

`packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": { "@eat.io/protocol": ["../protocol/src/index.ts"] }
  },
  "references": [{ "path": "../protocol" }],
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 5: `vitest.config.ts` (alias protocol to source so tests need no build)**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@eat.io/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["packages/**/test/**/*.test.ts"] },
});
```

- [ ] **Step 6: Write the trivial failing test**

`packages/protocol/test/version.test.ts`:
```ts
import { expect, test } from "vitest";
import { PROTOCOL_VERSION } from "../src/version.js";

test("protocol version is a positive integer", () => {
  expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  expect(PROTOCOL_VERSION).toBeGreaterThan(0);
});
```

- [ ] **Step 7: Install deps and run the test to see it fail**

Run: `cd /Users/briankruse/sandbox/eat.io && npm install && npm test`
Expected: FAIL — `version.js` / `PROTOCOL_VERSION` not found.

- [ ] **Step 8: Create `packages/protocol/src/version.ts`**

```ts
/** Bumped on any breaking change to message shapes. Sent in the handshake. */
export const PROTOCOL_VERSION = 1;
```

- [ ] **Step 9: Run test + typecheck**

Run: `npm test && npm run typecheck`
Expected: test PASS; `tsc -b` exits 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold eat.io monorepo (protocol + server workspaces, vitest, strict TS)"
```

---

### Task 2: Protocol enums

The shared domain enums, defined as zod enums so both runtime validation and types come from one place.

**Files:**
- Create: `packages/protocol/src/enums.ts`
- Test: `packages/protocol/test/enums.test.ts`

**Interfaces:**
- Produces:
  - `CardActionSchema` (`"add" | "multiply"`), type `CardAction`
  - `SeatSchema` (`"a" | "b"`), type `Seat`
  - `RoomPhaseSchema` (`"waiting" | "in-progress" | "paused" | "finished" | "abandoned"`), type `RoomPhase`
  - `ResultKindSchema` (`"win" | "loss" | "draw"`), type `ResultKind`
  - `RejectionCodeSchema` (`"NOT_IN_ROOM" | "NOT_YOUR_TURN" | "ALREADY_SUBMITTED" | "CARD_NOT_HELD" | "WRONG_TARGET_COUNT" | "BAD_TARGET"`), type `RejectionCode`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/enums.test.ts`:
```ts
import { expect, test } from "vitest";
import { CardActionSchema, RoomPhaseSchema, RejectionCodeSchema } from "../src/enums.js";

test("card action accepts add/multiply and rejects others", () => {
  expect(CardActionSchema.parse("add")).toBe("add");
  expect(CardActionSchema.parse("multiply")).toBe("multiply");
  expect(() => CardActionSchema.parse("plate")).toThrow();
});

test("room phase includes paused and abandoned", () => {
  expect(RoomPhaseSchema.parse("paused")).toBe("paused");
  expect(RoomPhaseSchema.parse("abandoned")).toBe("abandoned");
});

test("rejection code is a known machine code", () => {
  expect(RejectionCodeSchema.parse("CARD_NOT_HELD")).toBe("CARD_NOT_HELD");
  expect(() => RejectionCodeSchema.parse("nope")).toThrow();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- enums`
Expected: FAIL — `../src/enums.js` not found.

- [ ] **Step 3: Implement `packages/protocol/src/enums.ts`**

```ts
import { z } from "zod";

export const CardActionSchema = z.enum(["add", "multiply"]);
export type CardAction = z.infer<typeof CardActionSchema>;

export const SeatSchema = z.enum(["a", "b"]);
export type Seat = z.infer<typeof SeatSchema>;

export const RoomPhaseSchema = z.enum([
  "waiting",
  "in-progress",
  "paused",
  "finished",
  "abandoned",
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const ResultKindSchema = z.enum(["win", "loss", "draw"]);
export type ResultKind = z.infer<typeof ResultKindSchema>;

export const RejectionCodeSchema = z.enum([
  "NOT_IN_ROOM",
  "NOT_YOUR_TURN",
  "ALREADY_SUBMITTED",
  "CARD_NOT_HELD",
  "WRONG_TARGET_COUNT",
  "BAD_TARGET",
]);
export type RejectionCode = z.infer<typeof RejectionCodeSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- enums`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(protocol): shared domain enums as zod schemas"
```

---

### Task 3: Protocol messages + barrel

Every message as a zod schema, both directions, assembled into discriminated unions validated on receipt. This is the contract; the client will `z.infer` its types from here.

**Files:**
- Create: `packages/protocol/src/messages.ts`, `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: enums from Task 2; `PROTOCOL_VERSION` from Task 1.
- Produces (all `z.infer`red types exported from `index.ts`):
  - Value shapes: `CardViewSchema` `{ id, name, action, amount, targets }`; `TrayViewSchema` `{ id, value }`; `ResultSchema` `{ kind: ResultKind, scores: Record<Seat, number> }`.
  - `RoomStateSchema` (the per-player view, §5.3).
  - `ClientMessageSchema` — discriminated union on `type`; type `ClientMessage`.
  - `ServerMessageSchema` — discriminated union on `type`; type `ServerMessage`.
  - Helpers `parseClientMessage(raw: unknown): ClientMessage` and `parseServerMessage(raw: unknown): ServerMessage` (throw `ZodError` on invalid).

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/messages.test.ts`:
```ts
import { expect, test } from "vitest";
import {
  parseClientMessage,
  parseServerMessage,
  ClientMessageSchema,
  PROTOCOL_VERSION,
} from "../src/index.js";

test("valid hello parses and keeps optional sessionToken absent", () => {
  const msg = parseClientMessage({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" });
  expect(msg.type).toBe("hello");
  if (msg.type === "hello") expect(msg.sessionToken).toBeUndefined();
});

test("submitTurn requires cardId and targetTrayIds array", () => {
  const ok = parseClientMessage({ type: "submitTurn", cardId: "add1x1", targetTrayIds: ["t1"] });
  expect(ok.type).toBe("submitTurn");
  expect(() => parseClientMessage({ type: "submitTurn", cardId: "add1x1" })).toThrow();
});

test("unknown message type is rejected, not silently accepted", () => {
  expect(() => parseClientMessage({ type: "totallyMadeUp" })).toThrow();
});

test("server room.state carries opponent hand COUNT, never cards", () => {
  const view = {
    type: "roomState",
    phase: "in-progress",
    roundIndex: 0,
    roundCount: 10,
    deadlineAt: 123,
    you: { seat: "a", name: "Riley", score: 0, submitted: false,
      table: [{ id: "t1", value: 2 }],
      hand: [{ id: "add1x1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1 }] },
    opponent: { seat: "b", name: "Sam", score: 0, submitted: false, handCount: 5,
      table: [{ id: "u1", value: 3 }] },
  };
  const parsed = parseServerMessage(view);
  expect(parsed.type).toBe("roomState");
  // A stray opponent.hand field must be stripped/ignored, never surfaced as cards.
  expect((parsed as Record<string, unknown>)["opponent"]).not.toHaveProperty("hand");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- messages`
Expected: FAIL — `../src/index.js` not found.

- [ ] **Step 3: Implement `packages/protocol/src/messages.ts`**

```ts
import { z } from "zod";
import { PROTOCOL_VERSION } from "./version.js";
import {
  CardActionSchema,
  SeatSchema,
  RoomPhaseSchema,
  ResultKindSchema,
  RejectionCodeSchema,
} from "./enums.js";

// ---------- value shapes ----------

export const CardViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  action: CardActionSchema,
  amount: z.number().int().positive(),
  targets: z.number().int().positive(),
});

export const TrayViewSchema = z.object({
  id: z.string(),
  value: z.number().int(),
});

export const ResultSchema = z.object({
  kind: ResultKindSchema,
  scores: z.record(SeatSchema, z.number().int()),
});

const YouViewSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  score: z.number().int(),
  submitted: z.boolean(),
  table: z.array(TrayViewSchema),
  hand: z.array(CardViewSchema),
});

const OpponentViewSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  score: z.number().int(),
  submitted: z.boolean(),
  handCount: z.number().int().nonnegative(),
  table: z.array(TrayViewSchema),
  // NB: no `hand` — opponent cards are absent from the payload (§0.8).
});

export const RoomStateSchema = z.object({
  type: z.literal("roomState"),
  phase: RoomPhaseSchema,
  roundIndex: z.number().int().nonnegative(),
  roundCount: z.number().int().positive(),
  deadlineAt: z.number().int().nullable(), // epoch ms; null while paused/waiting
  you: YouViewSchema,
  opponent: OpponentViewSchema,
});

// ---------- client -> server ----------

export const HelloSchema = z.object({
  type: z.literal("hello"),
  protocolVersion: z.number().int(),
  name: z.string().min(1).max(14),
  sessionToken: z.string().optional(),
});
export const QueueJoinSchema = z.object({ type: z.literal("queueJoin") });
export const QueueCancelSchema = z.object({ type: z.literal("queueCancel") });
export const RoomCreatePrivateSchema = z.object({ type: z.literal("roomCreatePrivate") });
export const RoomJoinPrivateSchema = z.object({ type: z.literal("roomJoinPrivate"), code: z.string() });
export const SubmitTurnSchema = z.object({
  type: z.literal("submitTurn"),
  cardId: z.string(),
  targetTrayIds: z.array(z.string()),
});
export const RoomLeaveSchema = z.object({ type: z.literal("roomLeave") });
export const PingSchema = z.object({ type: z.literal("ping") });

export const ClientMessageSchema = z.discriminatedUnion("type", [
  HelloSchema,
  QueueJoinSchema,
  QueueCancelSchema,
  RoomCreatePrivateSchema,
  RoomJoinPrivateSchema,
  SubmitTurnSchema,
  RoomLeaveSchema,
  PingSchema,
]);

// ---------- server -> client ----------

export const WelcomeSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  sessionToken: z.string(),
});
export const ErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});
export const QueueWaitingSchema = z.object({ type: z.literal("queueWaiting") });
export const RoomJoinedPrivateSchema = z.object({ type: z.literal("roomJoinedPrivate"), code: z.string() });
export const ActionAcceptedSchema = z.object({ type: z.literal("actionAccepted") });
export const ActionRejectedSchema = z.object({
  type: z.literal("actionRejected"),
  code: RejectionCodeSchema,
  message: z.string(),
});
export const GameOverSchema = z.object({ type: z.literal("gameOver"), result: ResultSchema });
export const OpponentDisconnectedSchema = z.object({
  type: z.literal("opponentDisconnected"),
  graceEndsAt: z.number().int(),
});
export const OpponentReconnectedSchema = z.object({ type: z.literal("opponentReconnected") });
export const PongSchema = z.object({ type: z.literal("pong") });

export const ServerMessageSchema = z.discriminatedUnion("type", [
  WelcomeSchema,
  ErrorSchema,
  QueueWaitingSchema,
  RoomJoinedPrivateSchema,
  RoomStateSchema,
  ActionAcceptedSchema,
  ActionRejectedSchema,
  GameOverSchema,
  OpponentDisconnectedSchema,
  OpponentReconnectedSchema,
  PongSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RoomStateMessage = z.infer<typeof RoomStateSchema>;
export type CardView = z.infer<typeof CardViewSchema>;
export type TrayView = z.infer<typeof TrayViewSchema>;
export type Result = z.infer<typeof ResultSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessageSchema.parse(raw);
}
export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessageSchema.parse(raw);
}

export { PROTOCOL_VERSION };
```

- [ ] **Step 4: Implement the barrel `packages/protocol/src/index.ts`**

```ts
export * from "./version.js";
export * from "./enums.js";
export * from "./messages.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- messages`
Expected: PASS (note the opponent-view test relies on zod stripping unknown keys by default — `hand` is not in `OpponentViewSchema`, so it is dropped).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(protocol): message schemas + discriminated unions for both directions"
```

---

### Task 4: Seeded RNG + engine domain types

The pure PRNG (so shuffles/draws are reproducible and inspectable) and the internal game-state types the engine operates on. No effect logic yet.

**Files:**
- Create: `packages/server/src/util/rng.ts`, `packages/server/src/engine/state.ts`
- Test: `packages/server/test/rng.test.ts`

**Interfaces:**
- Produces (rng.ts): `interface Rng { readonly state: number }`; `makeRng(seed: number): Rng`; `nextUint32(rng): [number, Rng]`; `nextInt(rng, maxExclusive): [number, Rng]`; `shuffle<T>(rng, items): [T[], Rng]`; `pick<T>(rng, items): [T, Rng]`.
- Produces (state.ts): `PlayerId`, `Card`, `Tray`, `Submission`, `PlayerState`, `GameState` (shapes below). `GameState` holds `rng: Rng` and `nextTrayId: number` so tray ids are generated deterministically.

- [ ] **Step 1: Write the failing test**

`packages/server/test/rng.test.ts`:
```ts
import { expect, test } from "vitest";
import { makeRng, nextInt, shuffle } from "../src/util/rng.js";

test("same seed yields the same sequence", () => {
  const seq = (seed: number) => {
    let rng = makeRng(seed);
    const out: number[] = [];
    for (let i = 0; i < 5; i++) { const [v, n] = nextInt(rng, 100); out.push(v); rng = n; }
    return out;
  };
  expect(seq(42)).toEqual(seq(42));
  expect(seq(42)).not.toEqual(seq(43));
});

test("shuffle is a permutation and is deterministic per seed", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const [a] = shuffle(makeRng(7), items);
  const [b] = shuffle(makeRng(7), items);
  expect(a).toEqual(b);
  expect([...a].sort((x, y) => x - y)).toEqual(items);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- rng`
Expected: FAIL — `../src/util/rng.js` not found.

- [ ] **Step 3: Implement `packages/server/src/util/rng.ts`**

```ts
export interface Rng {
  readonly state: number;
}

export function makeRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

// mulberry32 — small, fast, fully determined by state.
export function nextUint32(rng: Rng): [number, Rng] {
  const t = (rng.state + 0x6d2b79f5) >>> 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  r = (r ^ (r >>> 14)) >>> 0;
  return [r, { state: t }];
}

export function nextInt(rng: Rng, maxExclusive: number): [number, Rng] {
  if (maxExclusive <= 0) throw new Error("nextInt: maxExclusive must be > 0");
  const [u, next] = nextUint32(rng);
  return [u % maxExclusive, next];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): [T[], Rng] {
  const arr = items.slice();
  let cur = rng;
  for (let i = arr.length - 1; i > 0; i--) {
    const [j, next] = nextInt(cur, i + 1);
    cur = next;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return [arr, cur];
}

export function pick<T>(rng: Rng, items: readonly T[]): [T, Rng] {
  if (items.length === 0) throw new Error("pick: empty array");
  const [i, next] = nextInt(rng, items.length);
  return [items[i]!, next];
}
```

- [ ] **Step 4: Implement `packages/server/src/engine/state.ts`**

```ts
import type { CardAction, RoomPhase, Seat } from "@eat.io/protocol";
import type { Rng } from "../util/rng.js";

export type PlayerId = string;

export interface Card {
  id: string;
  name: string;
  action: CardAction;
  amount: number;
  targets: number;
}

export interface Tray {
  id: string;
  value: number;
}

/** A player's committed choice for the round. `discard` is the idle auto-move. */
export interface Submission {
  cardId: string;
  targetTrayIds: string[];
  discard?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  seat: Seat;
  name: string;
  connected: boolean;
  table: Tray[];
  hand: Card[];
  deck: Card[];
  score: number;
  submission: Submission | null;
}

export interface GameState {
  roomId: string;
  phase: RoomPhase;
  roundIndex: number;
  roundCount: number;
  players: Record<PlayerId, PlayerState>;
  rng: Rng;
  nextTrayId: number;
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- rng && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): seeded PRNG and game-state domain types"
```

---

### Task 5: Rules module (content as data + effect dispatch)

Card catalog and tuning declared as data; effects resolved by dispatch over `card.action`, never an if/else chain. This is the swappable seam (§0.9, §1.6). Provisional base set only.

**Files:**
- Create: `packages/server/src/engine/rules/content.ts`, `packages/server/src/engine/rules/index.ts`
- Test: `packages/server/test/rules.test.ts`

**Interfaces:**
- Consumes: `Card`, `Tray` (Task 4); `Rng`, `shuffle` (Task 4); `CardAction` (protocol).
- Produces:
  - `interface Rules { readonly cards: readonly Card[]; readonly config: RulesConfig; buildDeck(rng: Rng): [Card[], Rng]; freshTrayValue(rng: Rng): [number, Rng]; applyEffect(tray: Tray, card: Card): Tray; }`
  - `interface RulesConfig { tableLength: number; handSize: number; roundCount: number; trayMin: number; trayMax: number; deckSize: number }`
  - `defaultRules: Rules`

- [ ] **Step 1: Write the failing test**

`packages/server/test/rules.test.ts`:
```ts
import { expect, test } from "vitest";
import { defaultRules } from "../src/engine/rules/index.js";
import { makeRng } from "../src/util/rng.js";

test("add and multiply effects dispatch over data", () => {
  const add = defaultRules.cards.find((c) => c.action === "add")!;
  const mul = defaultRules.cards.find((c) => c.action === "multiply")!;
  expect(defaultRules.applyEffect({ id: "t", value: 3 }, add).value).toBe(3 + add.amount);
  expect(defaultRules.applyEffect({ id: "t", value: 3 }, mul).value).toBe(3 * mul.amount);
});

test("buildDeck is deterministic per seed and sized to config", () => {
  const [d1] = defaultRules.buildDeck(makeRng(1));
  const [d2] = defaultRules.buildDeck(makeRng(1));
  expect(d1.map((c) => c.id)).toEqual(d2.map((c) => c.id));
  expect(d1.length).toBe(defaultRules.config.deckSize);
});

test("fresh tray value is within the configured band", () => {
  let rng = makeRng(99);
  for (let i = 0; i < 50; i++) {
    const [v, n] = defaultRules.freshTrayValue(rng);
    rng = n;
    expect(v).toBeGreaterThanOrEqual(defaultRules.config.trayMin);
    expect(v).toBeLessThanOrEqual(defaultRules.config.trayMax);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- rules`
Expected: FAIL — `../src/engine/rules/index.js` not found.

- [ ] **Step 3: Implement `packages/server/src/engine/rules/content.ts`**

```ts
import type { Card } from "../state.js";

// ---------------------------------------------------------------------------
// PROVISIONAL base rules content. This is a starter set the owner will expand
// and rebalance — it exists only to prove the machinery end to end (§0.9).
// Do NOT treat these values as final game design.
// ---------------------------------------------------------------------------

export const CARD_CATALOG: readonly Card[] = [
  { id: "add1x1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1 },
  { id: "add1x2", name: "Add One Food To Two Trays", action: "add", amount: 1, targets: 2 },
  { id: "add3x1", name: "Add Three Food To One Tray", action: "add", amount: 3, targets: 1 },
  { id: "mul2x1", name: "Double Food On One Tray", action: "multiply", amount: 2, targets: 1 },
  { id: "mul2x2", name: "Double Food On Two Trays", action: "multiply", amount: 2, targets: 2 },
  { id: "mul3x1", name: "Triple Food On One Tray", action: "multiply", amount: 3, targets: 1 },
];

export const TUNING = {
  tableLength: 5,
  handSize: 5,
  roundCount: 10,
  trayMin: 1,
  trayMax: 4,
  deckSize: 40,
} as const;
```

- [ ] **Step 4: Implement `packages/server/src/engine/rules/index.ts`**

```ts
import type { CardAction } from "@eat.io/protocol";
import type { Card, Tray } from "../state.js";
import { type Rng, nextInt, shuffle } from "../../util/rng.js";
import { CARD_CATALOG, TUNING } from "./content.js";

export interface RulesConfig {
  tableLength: number;
  handSize: number;
  roundCount: number;
  trayMin: number;
  trayMax: number;
  deckSize: number;
}

export interface Rules {
  readonly cards: readonly Card[];
  readonly config: RulesConfig;
  buildDeck(rng: Rng): [Card[], Rng];
  freshTrayValue(rng: Rng): [number, Rng];
  applyEffect(tray: Tray, card: Card): Tray;
}

// Effect dispatch over data — a new action is a new entry, not a new branch.
const EFFECTS: Record<CardAction, (value: number, amount: number) => number> = {
  add: (value, amount) => value + amount,
  multiply: (value, amount) => value * amount,
};

export const defaultRules: Rules = {
  cards: CARD_CATALOG,
  config: { ...TUNING },

  buildDeck(rng) {
    const pool: Card[] = [];
    for (let i = 0; i < TUNING.deckSize; i++) {
      pool.push(CARD_CATALOG[i % CARD_CATALOG.length]!);
    }
    return shuffle(rng, pool);
  },

  freshTrayValue(rng) {
    const span = TUNING.trayMax - TUNING.trayMin + 1;
    const [n, next] = nextInt(rng, span);
    return [TUNING.trayMin + n, next];
  },

  applyEffect(tray, card) {
    const fn = EFFECTS[card.action];
    return { ...tray, value: fn(tray.value, card.amount) };
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- rules`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): provisional rules content with data-driven effect dispatch"
```

---

### Task 6: Initial deal

Builds a fresh `GameState` for two seated players — the exact place the prototype had off-by-one bugs, so the test pins hand/deck/table sizes precisely.

**Files:**
- Create: `packages/server/src/engine/deal.ts`
- Test: `packages/server/test/deal.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerState`, `Card`, `Tray` (Task 4); `Rules` (Task 5); `Rng`, `makeRng` (Task 4).
- Produces: `createGame(opts: CreateGameOptions): GameState` where
  `interface CreateGameOptions { roomId: string; seats: { id: PlayerId; seat: Seat; name: string }[]; rules: Rules; roundCount: number; seed: number }`.
  Deals `rules.config.handSize` cards and `rules.config.tableLength` trays per player; the game starts in phase `"in-progress"`, `roundIndex: 0`, all `submission: null`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/deal.test.ts`:
```ts
import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";

const opts = () => ({
  roomId: "r1",
  seats: [
    { id: "p1", seat: "a" as const, name: "Riley" },
    { id: "p2", seat: "b" as const, name: "Sam" },
  ],
  rules: defaultRules,
  roundCount: 10,
  seed: 123,
});

test("each player gets exactly handSize cards and tableLength trays", () => {
  const g = createGame(opts());
  for (const p of Object.values(g.players)) {
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
    expect(p.deck.length).toBe(defaultRules.config.deckSize - defaultRules.config.handSize);
    expect(p.score).toBe(0);
    expect(p.submission).toBeNull();
    expect(p.connected).toBe(true);
  }
});

test("all tray ids in the game are unique", () => {
  const g = createGame(opts());
  const ids = Object.values(g.players).flatMap((p) => p.table.map((t) => t.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test("same seed produces an identical deal", () => {
  const a = createGame(opts());
  const b = createGame(opts());
  expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- deal`
Expected: FAIL — `../src/engine/deal.js` not found.

- [ ] **Step 3: Implement `packages/server/src/engine/deal.ts`**

```ts
import type { Seat } from "@eat.io/protocol";
import { makeRng, type Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import type { GameState, PlayerId, PlayerState, Tray } from "./state.js";

export interface CreateGameOptions {
  roomId: string;
  seats: { id: PlayerId; seat: Seat; name: string }[];
  rules: Rules;
  roundCount: number;
  seed: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  const { rules } = opts;
  let rng: Rng = makeRng(opts.seed);
  let nextTrayId = 0;
  const players: Record<PlayerId, PlayerState> = {};

  for (const seat of opts.seats) {
    const [deck, afterDeck] = rules.buildDeck(rng);
    rng = afterDeck;
    const hand = deck.splice(0, rules.config.handSize); // remove dealt cards from the pile

    const table: Tray[] = [];
    for (let i = 0; i < rules.config.tableLength; i++) {
      const [value, afterVal] = rules.freshTrayValue(rng);
      rng = afterVal;
      table.push({ id: String(nextTrayId++), value });
    }

    players[seat.id] = {
      id: seat.id,
      seat: seat.seat,
      name: seat.name,
      connected: true,
      table,
      hand,
      deck,
      score: 0,
      submission: null,
    };
  }

  return {
    roomId: opts.roomId,
    phase: "in-progress",
    roundIndex: 0,
    roundCount: opts.roundCount,
    players,
    rng,
    nextTrayId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): initial deal with pinned hand/deck/table sizes"
```

---

### Task 7: Engine — validateAction (integrity)

Server-side legality of a `submitTurn`, independent of any client cooperation (§0.8). This is the integrity guarantee; every branch returns a typed `RejectionCode`.

**Files:**
- Create: `packages/server/src/engine/engine.ts`
- Test: `packages/server/test/engine.validate.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerId`, `Submission` (Task 4); `RejectionCode` (protocol).
- Produces: `type ValidationResult = { ok: true } | { ok: false; code: RejectionCode; message: string }`; `validateAction(state, playerId, action: Submission): ValidationResult`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/engine.validate.test.ts`:
```ts
import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { validateAction } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("rejects a player not in the room", () => {
  const r = validateAction(game(), "ghost", { cardId: "x", targetTrayIds: [] });
  expect(r).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
});

test("rejects a card the player does not hold", () => {
  const r = validateAction(game(), "p1", { cardId: "not-a-real-card", targetTrayIds: ["0"] });
  expect(r).toMatchObject({ ok: false, code: "CARD_NOT_HELD" });
});

test("rejects the wrong number of targets for the card", () => {
  const g = game();
  const oneTarget = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const r = validateAction(g, "p1", { cardId: oneTarget.id, targetTrayIds: [] });
  expect(r).toMatchObject({ ok: false, code: "WRONG_TARGET_COUNT" });
});

test("rejects targeting a tray that is not on your own table", () => {
  const g = game();
  const oneTarget = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const opponentTrayId = g.players["p2"]!.table[0]!.id;
  const r = validateAction(g, "p1", { cardId: oneTarget.id, targetTrayIds: [opponentTrayId] });
  expect(r).toMatchObject({ ok: false, code: "BAD_TARGET" });
});

test("accepts a legal move and rejects a second submission", () => {
  const g = game();
  const oneTarget = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const ownTrayId = g.players["p1"]!.table[0]!.id;
  expect(validateAction(g, "p1", { cardId: oneTarget.id, targetTrayIds: [ownTrayId] })).toEqual({ ok: true });
  g.players["p1"]!.submission = { cardId: oneTarget.id, targetTrayIds: [ownTrayId] };
  expect(validateAction(g, "p1", { cardId: oneTarget.id, targetTrayIds: [ownTrayId] })).toMatchObject({
    ok: false,
    code: "ALREADY_SUBMITTED",
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- engine.validate`
Expected: FAIL — `../src/engine/engine.js` not found.

- [ ] **Step 3: Implement `packages/server/src/engine/engine.ts`** (first functions; more appended in later tasks)

```ts
import type { RejectionCode } from "@eat.io/protocol";
import type { GameState, PlayerId, Submission } from "./state.js";

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: RejectionCode; message: string };

function reject(code: RejectionCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

export function validateAction(
  state: GameState,
  playerId: PlayerId,
  action: Submission,
): ValidationResult {
  const player = state.players[playerId];
  if (!player) return reject("NOT_IN_ROOM", "You are not seated in this room.");
  if (state.phase !== "in-progress") return reject("NOT_YOUR_TURN", "The game is not accepting moves right now.");
  if (player.submission) return reject("ALREADY_SUBMITTED", "You have already submitted this round.");

  const card = player.hand.find((c) => c.id === action.cardId);
  if (!card) return reject("CARD_NOT_HELD", "You do not hold that card.");
  if (action.targetTrayIds.length !== card.targets) {
    return reject("WRONG_TARGET_COUNT", `That card needs ${card.targets} target(s).`);
  }
  if (new Set(action.targetTrayIds).size !== action.targetTrayIds.length) {
    return reject("BAD_TARGET", "A tray was targeted more than once.");
  }
  const ownTrayIds = new Set(player.table.map((t) => t.id));
  for (const id of action.targetTrayIds) {
    if (!ownTrayIds.has(id)) return reject("BAD_TARGET", "You can only target trays on your own table.");
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engine.validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): server-side action validation (integrity guarantee)"
```

---

### Task 8: Engine — applyAction, autoMove, everyoneSubmitted

Records a validated submission, the idle auto-discard, and the round barrier. The barrier is deliberately separate from resolution (§1.6).

**Files:**
- Modify: `packages/server/src/engine/engine.ts` (append)
- Test: `packages/server/test/engine.submit.test.ts`

**Interfaces:**
- Consumes: `pick` (Task 4); `GameState`, `PlayerId`, `Submission`, `PlayerState` (Task 4).
- Produces: `applyAction(state, playerId, action: Submission): GameState`; `autoMove(state, playerId): GameState`; `everyoneSubmitted(state): boolean`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/engine.submit.test.ts`:
```ts
import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { applyAction, autoMove, everyoneSubmitted } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("applyAction records a submission without changing the board", () => {
  const g = game();
  const card = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const trayId = g.players["p1"]!.table[0]!.id;
  const before = JSON.stringify(g.players["p1"]!.table);
  const next = applyAction(g, "p1", { cardId: card.id, targetTrayIds: [trayId] });
  expect(next.players["p1"]!.submission).toMatchObject({ cardId: card.id, targetTrayIds: [trayId] });
  expect(JSON.stringify(next.players["p1"]!.table)).toBe(before); // no board change yet
});

test("autoMove marks a discard submission of a held card", () => {
  const g = game();
  const next = autoMove(g, "p1");
  const sub = next.players["p1"]!.submission!;
  expect(sub.discard).toBe(true);
  expect(next.players["p1"]!.hand.some((c) => c.id === sub.cardId)).toBe(true);
});

test("everyoneSubmitted is the barrier across all players", () => {
  let g = game();
  expect(everyoneSubmitted(g)).toBe(false);
  g = autoMove(g, "p1");
  expect(everyoneSubmitted(g)).toBe(false);
  g = autoMove(g, "p2");
  expect(everyoneSubmitted(g)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- engine.submit`
Expected: FAIL — `applyAction` / `autoMove` / `everyoneSubmitted` not exported.

- [ ] **Step 3: Append to `packages/server/src/engine/engine.ts`**

Add to the import block at the top:
```ts
import { pick } from "../util/rng.js";
```
Append these functions:
```ts
export function applyAction(state: GameState, playerId: PlayerId, action: Submission): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  const submission: Submission = { cardId: action.cardId, targetTrayIds: [...action.targetTrayIds] };
  return { ...state, players: { ...state.players, [playerId]: { ...player, submission } } };
}

export function autoMove(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (!player || player.submission || player.hand.length === 0) return state;
  const [card, rng] = pick(state.rng, player.hand);
  const submission: Submission = { cardId: card.id, targetTrayIds: [], discard: true };
  return { ...state, rng, players: { ...state.players, [playerId]: { ...player, submission } } };
}

export function everyoneSubmitted(state: GameState): boolean {
  const players = Object.values(state.players);
  return players.length > 0 && players.every((p) => p.submission !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engine.submit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): submission recording, idle auto-discard, round barrier"
```

---

### Task 9: Engine — resolveRound

Applies both submissions, eats each front tray, scores it, replaces played cards, appends fresh trays, clears submissions, and increments `roundIndex`. Effects go through `rules.applyEffect` (data dispatch). Rules are injected so the engine stays decoupled from the concrete content.

**Files:**
- Modify: `packages/server/src/engine/engine.ts` (append)
- Test: `packages/server/test/engine.resolve.test.ts`

**Interfaces:**
- Consumes: `Rules` (Task 5); `Rng` (Task 4); `Card`, `PlayerState`, `Tray`, `GameState` (Task 4).
- Produces:
  - `type GameEvent = { type: "trayEaten"; playerId: PlayerId; trayId: string; value: number } | { type: "roundResolved"; roundIndex: number }`
  - `resolveRound(state: GameState, rules: Rules): { state: GameState; events: GameEvent[] }`

- [ ] **Step 1: Write the failing test**

`packages/server/test/engine.resolve.test.ts`:
```ts
import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { applyAction, autoMove, resolveRound } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("an add card boosts the targeted tray, and the front tray is eaten and scored", () => {
  let g = game();
  const p1 = g.players["p1"]!;
  const addCard = p1.hand.find((c) => c.action === "add" && c.targets === 1)!;
  const frontTray = p1.table[0]!;
  const expectedScore = frontTray.value + addCard.amount; // boost the front tray, then eat it

  g = applyAction(g, "p1", { cardId: addCard.id, targetTrayIds: [frontTray.id] });
  g = autoMove(g, "p2");
  const { state } = resolveRound(g, defaultRules);

  expect(state.players["p1"]!.score).toBe(expectedScore);
  expect(state.roundIndex).toBe(1);
  expect(state.players["p1"]!.submission).toBeNull();
});

test("hand size and table length are preserved across a round", () => {
  let g = game();
  g = autoMove(g, "p1");
  g = autoMove(g, "p2");
  const { state } = resolveRound(g, defaultRules);
  for (const p of Object.values(state.players)) {
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
  }
});

test("a discard applies no effect but still consumes a card and eats the front tray", () => {
  let g = game();
  const frontValue = g.players["p1"]!.table[0]!.value;
  g = autoMove(g, "p1"); // discard
  g = autoMove(g, "p2");
  const { state } = resolveRound(g, defaultRules);
  expect(state.players["p1"]!.score).toBe(frontValue); // no boost from a discard
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- engine.resolve`
Expected: FAIL — `resolveRound` not exported.

- [ ] **Step 3: Append to `packages/server/src/engine/engine.ts`**

Add to the import block:
```ts
import type { Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import type { Card, PlayerState, Tray } from "./state.js";
```
Append:
```ts
export type GameEvent =
  | { type: "trayEaten"; playerId: PlayerId; trayId: string; value: number }
  | { type: "roundResolved"; roundIndex: number };

function drawCard(deck: Card[], rng: Rng, rules: Rules): [Card, Card[], Rng] {
  if (deck.length === 0) {
    const [fresh, r2] = rules.buildDeck(rng);
    return [fresh[0]!, fresh.slice(1), r2];
  }
  return [deck[0]!, deck.slice(1), rng];
}

export function resolveRound(state: GameState, rules: Rules): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let rng = state.rng;
  let nextTrayId = state.nextTrayId;
  const players: Record<PlayerId, PlayerState> = {};

  // Deterministic order so a seeded game is fully reproducible.
  const ordered = Object.values(state.players).sort((a, b) => a.seat.localeCompare(b.seat));

  for (const p of ordered) {
    let { hand, deck, table, score } = p;
    const sub = p.submission;

    if (sub) {
      if (!sub.discard) {
        const card = hand.find((c) => c.id === sub.cardId);
        if (card) {
          const targets = new Set(sub.targetTrayIds);
          table = table.map((t) => (targets.has(t.id) ? rules.applyEffect(t, card) : t));
        }
      }
      const idx = hand.findIndex((c) => c.id === sub.cardId);
      if (idx >= 0) {
        hand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
        const [drawn, deckAfter, rngAfter] = drawCard(deck, rng, rules);
        deck = deckAfter;
        rng = rngAfter;
        hand = [...hand, drawn];
      }
    }

    const front = table[0];
    if (front) {
      score += front.value;
      table = table.slice(1);
      events.push({ type: "trayEaten", playerId: p.id, trayId: front.id, value: front.value });
    }

    const [value, rngValue] = rules.freshTrayValue(rng);
    rng = rngValue;
    const freshTray: Tray = { id: String(nextTrayId++), value };
    table = [...table, freshTray];

    players[p.id] = { ...p, hand, deck, table, score, submission: null };
  }

  const next: GameState = {
    ...state,
    players,
    rng,
    nextTrayId,
    roundIndex: state.roundIndex + 1,
  };
  events.push({ type: "roundResolved", roundIndex: next.roundIndex });
  return { state: next, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engine.resolve`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): round resolution — effects, eating, scoring, redraw"
```

---

### Task 10: Engine — end condition + ranking (kept separate)

The swappable end predicate and the result ranking. Critically: `isGameOver` never reads scores; `rankResult` never decides when to stop; a **draw** is an ordinary value (§0.7).

**Files:**
- Modify: `packages/server/src/engine/engine.ts` (append)
- Test: `packages/server/test/engine.endgame.test.ts`

**Interfaces:**
- Consumes: `GameState` (Task 4); `Seat`, `Result` (protocol).
- Produces:
  - `type EndCondition = (state: GameState) => boolean`; `roundLimitReached: EndCondition`; `isGameOver(state, ended?: EndCondition): boolean`.
  - `interface RankedResult { scores: Record<Seat, number>; winner: Seat | null }` (null = draw); `rankResult(state): RankedResult`.
  - `resultFor(ranked: RankedResult, seat: Seat): Result` — the viewer-relative message payload.

- [ ] **Step 1: Write the failing test**

`packages/server/test/engine.endgame.test.ts`:
```ts
import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { isGameOver, rankResult, resultFor } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("isGameOver reads the round, never the score", () => {
  const g = game();
  g.players["p1"]!.score = 9999; // huge score must NOT end the game
  expect(isGameOver({ ...g, roundIndex: 0 })).toBe(false);
  expect(isGameOver({ ...g, roundIndex: 10 })).toBe(true);
});

test("rankResult picks the higher score and represents a draw as winner null", () => {
  const g = game();
  g.players["p1"]!.score = 20;
  g.players["p2"]!.score = 14;
  expect(rankResult(g)).toEqual({ scores: { a: 20, b: 14 }, winner: "a" });
  g.players["p2"]!.score = 20;
  expect(rankResult(g)).toEqual({ scores: { a: 20, b: 20 }, winner: null });
});

test("resultFor is relative to the viewer", () => {
  const ranked = { scores: { a: 20, b: 14 } as Record<"a" | "b", number>, winner: "a" as const };
  expect(resultFor(ranked, "a").kind).toBe("win");
  expect(resultFor(ranked, "b").kind).toBe("loss");
  expect(resultFor({ scores: { a: 5, b: 5 }, winner: null }, "a").kind).toBe("draw");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- engine.endgame`
Expected: FAIL — `isGameOver` / `rankResult` / `resultFor` not exported.

- [ ] **Step 3: Append to `packages/server/src/engine/engine.ts`**

Add to the import block:
```ts
import type { Result, Seat } from "@eat.io/protocol";
```
Append:
```ts
export type EndCondition = (state: GameState) => boolean;

/** Default end condition. Reads ONLY the round count — never scores. */
export const roundLimitReached: EndCondition = (state) => state.roundIndex >= state.roundCount;

export function isGameOver(state: GameState, ended: EndCondition = roundLimitReached): boolean {
  return ended(state);
}

export interface RankedResult {
  scores: Record<Seat, number>;
  winner: Seat | null; // null === draw
}

/** Ranks final scores. Never decides WHEN to stop — only who is ahead. */
export function rankResult(state: GameState): RankedResult {
  const scores = {} as Record<Seat, number>;
  let winner: Seat | null = null;
  let best = -Infinity;
  let tied = false;
  for (const p of Object.values(state.players)) {
    scores[p.seat] = p.score;
    if (p.score > best) {
      best = p.score;
      winner = p.seat;
      tied = false;
    } else if (p.score === best) {
      tied = true;
    }
  }
  return { scores, winner: tied ? null : winner };
}

export function resultFor(ranked: RankedResult, seat: Seat): Result {
  const kind = ranked.winner === null ? "draw" : ranked.winner === seat ? "win" : "loss";
  return { kind, scores: ranked.scores };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engine.endgame`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): swappable end condition and draw-aware ranking, kept separate"
```

---

### Task 11: Engine — viewFor (per-player projection / secrecy)

The only thing the room ever sends. Omits the opponent's hand and both decks by construction; validates against the protocol schema.

**Files:**
- Modify: `packages/server/src/engine/engine.ts` (append) — or create `viewFor.ts` and re-export; this plan keeps it in `engine.ts` for one import site.
- Test: `packages/server/test/viewFor.test.ts`

**Interfaces:**
- Consumes: `GameState`, `PlayerId` (Task 4); `RoomStateMessage` (protocol).
- Produces: `viewFor(state: GameState, playerId: PlayerId, deadlineAt: number | null): RoomStateMessage`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/viewFor.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseServerMessage } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { viewFor } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("view shows your hand but never the opponent's cards or any deck", () => {
  const view = viewFor(game(), "p1", 12345);
  expect(view.you.hand.length).toBe(defaultRules.config.handSize);
  expect((view.opponent as Record<string, unknown>)["hand"]).toBeUndefined();
  expect(view.opponent.handCount).toBe(defaultRules.config.handSize);
  expect(JSON.stringify(view)).not.toContain("deck"); // deck never leaves the server
  expect(view.deadlineAt).toBe(12345);
});

test("the projection validates against the protocol schema", () => {
  expect(() => parseServerMessage(viewFor(game(), "p1", null))).not.toThrow();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- viewFor`
Expected: FAIL — `viewFor` not exported.

- [ ] **Step 3: Append to `packages/server/src/engine/engine.ts`**

Add to the import block:
```ts
import type { RoomStateMessage } from "@eat.io/protocol";
```
Append:
```ts
export function viewFor(state: GameState, playerId: PlayerId, deadlineAt: number | null): RoomStateMessage {
  const you = state.players[playerId];
  if (!you) throw new Error(`viewFor: unknown player ${playerId}`);
  const opponent = Object.values(state.players).find((p) => p.id !== playerId);
  if (!opponent) throw new Error("viewFor: no opponent seated");

  return {
    type: "roomState",
    phase: state.phase,
    roundIndex: state.roundIndex,
    roundCount: state.roundCount,
    deadlineAt,
    you: {
      seat: you.seat,
      name: you.name,
      score: you.score,
      submitted: you.submission !== null,
      table: you.table.map((t) => ({ id: t.id, value: t.value })),
      hand: you.hand.map((c) => ({
        id: c.id,
        name: c.name,
        action: c.action,
        amount: c.amount,
        targets: c.targets,
      })),
    },
    opponent: {
      seat: opponent.seat,
      name: opponent.name,
      score: opponent.score,
      submitted: opponent.submission !== null,
      handCount: opponent.hand.length,
      table: opponent.table.map((t) => ({ id: t.id, value: t.value })),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- viewFor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): per-player projection that omits hidden information"
```

---

### Task 12: Engine — full-game integration proof

A test that plays a complete game in a plain loop with no server running. If this can't be written, the engine seam is wrong (§1.4).

**Files:**
- Test: `packages/server/test/fullGame.test.ts`

**Interfaces:**
- Consumes everything from Tasks 5–11.

- [ ] **Step 1: Write the test**

`packages/server/test/fullGame.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseServerMessage } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import {
  autoMove,
  everyoneSubmitted,
  isGameOver,
  rankResult,
  resolveRound,
  viewFor,
} from "../src/engine/engine.js";

function play(seed: number) {
  let g = createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed,
  });
  let guard = 0;
  while (!isGameOver(g)) {
    g = autoMove(g, "p1");
    g = autoMove(g, "p2");
    expect(everyoneSubmitted(g)).toBe(true);
    ({ state: g } = resolveRound(g, defaultRules));
    if (++guard > 100) throw new Error("game did not terminate");
  }
  return g;
}

test("a full game terminates after roundCount rounds with valid state throughout", () => {
  const g = play(7);
  expect(g.roundIndex).toBe(10);
  for (const p of Object.values(g.players)) {
    expect(p.score).toBeGreaterThan(0);
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
  }
  const ranked = rankResult(g);
  expect(ranked.winner === null || ranked.winner === "a" || ranked.winner === "b").toBe(true);
  expect(() => parseServerMessage(viewFor(g, "p1", null))).not.toThrow();
});

test("same seed produces identical final scores (reproducible)", () => {
  const scores = (seed: number) => Object.values(play(seed).players).map((p) => p.score);
  expect(scores(11)).toEqual(scores(11));
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- fullGame`
Expected: PASS. (No implementation needed — this is the integration gate for Tasks 5–11.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(engine): full game plays to completion in a plain loop, reproducibly"
```

---

### Task 13: Structured logger

Leveled JSON logging, one small module. No bare `console.log` elsewhere in the codebase.

**Files:**
- Create: `packages/server/src/logger.ts`
- Test: `packages/server/test/logger.test.ts`

**Interfaces:**
- Produces: `type LogLevel = "debug" | "info" | "warn" | "error"`; `interface Logger { debug; info; warn; error; child(bindings): Logger }` (each level is `(msg: string, fields?: Record<string, unknown>) => void`); `createLogger(level: LogLevel, base?: Record<string, unknown>): Logger`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/logger.test.ts`:
```ts
import { afterEach, expect, test, vi } from "vitest";
import { createLogger } from "../src/logger.js";

afterEach(() => vi.restoreAllMocks());

test("levels below the threshold are suppressed", () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  const log = createLogger("info");
  log.debug("hidden");
  log.info("shown");
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0]![0]).toContain("shown");
});

test("child merges bindings into every line", () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  const log = createLogger("debug", { app: "eatio" }).child({ roomId: "r1" });
  log.info("hi", { extra: 1 });
  const line = spy.mock.calls[0]![0] as string;
  expect(line).toContain('"app":"eatio"');
  expect(line).toContain('"roomId":"r1"');
  expect(line).toContain('"extra":1');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- logger`
Expected: FAIL — `../src/logger.js` not found.

- [ ] **Step 3: Implement `packages/server/src/logger.ts`**

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

type LogFn = (msg: string, fields?: Record<string, unknown>) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel, base: Record<string, unknown> = {}): Logger {
  const at = (lvl: LogLevel): LogFn => (msg, fields = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const line = JSON.stringify({ level: lvl, msg, ...base, ...fields });
    if (lvl === "error" || lvl === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (bindings) => createLogger(level, { ...base, ...bindings }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- logger`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): structured leveled logger"
```

---

### Task 14: Configuration

Env → typed `Config`, one place, sane defaults, loud failure on a malformed value.

**Files:**
- Create: `packages/server/src/config.ts`
- Test: `packages/server/test/config.test.ts`

**Interfaces:**
- Consumes: `LogLevel` (Task 13).
- Produces: `interface Config { port; roundCount; moveDeadlineMs; reconnectGraceMs; heartbeatIntervalMs; heartbeatTimeoutMs; tableLength; handSize; seed: number | null; logLevel: LogLevel }`; `loadConfig(env?: Record<string, string | undefined>): Config`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/config.test.ts`:
```ts
import { expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

test("defaults match the spec", () => {
  const c = loadConfig({});
  expect(c.port).toBe(8000);
  expect(c.roundCount).toBe(10);
  expect(c.moveDeadlineMs).toBe(20000);
  expect(c.reconnectGraceMs).toBe(30000);
  expect(c.seed).toBeNull();
  expect(c.logLevel).toBe("info");
});

test("env overrides are parsed as integers", () => {
  const c = loadConfig({ PORT: "9001", ROUND_COUNT: "6", RNG_SEED: "42", LOG_LEVEL: "debug" });
  expect(c.port).toBe(9001);
  expect(c.roundCount).toBe(6);
  expect(c.seed).toBe(42);
  expect(c.logLevel).toBe("debug");
});

test("a non-numeric override fails loudly", () => {
  expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/PORT/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- config`
Expected: FAIL — `../src/config.js` not found.

- [ ] **Step 3: Implement `packages/server/src/config.ts`**

```ts
import type { LogLevel } from "./logger.js";

export interface Config {
  port: number;
  roundCount: number;
  moveDeadlineMs: number;
  reconnectGraceMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  tableLength: number;
  handSize: number;
  seed: number | null;
  logLevel: LogLevel;
}

type Env = Record<string, string | undefined>;

function int(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`Config: ${key} must be an integer, got "${raw}"`);
  return n;
}

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export function loadConfig(env: Env = process.env): Config {
  const rawLevel = env["LOG_LEVEL"];
  const logLevel: LogLevel =
    rawLevel && (LEVELS as readonly string[]).includes(rawLevel) ? (rawLevel as LogLevel) : "info";
  const seedRaw = env["RNG_SEED"];
  return {
    port: int(env, "PORT", 8000),
    roundCount: int(env, "ROUND_COUNT", 10),
    moveDeadlineMs: int(env, "MOVE_DEADLINE_MS", 20000),
    reconnectGraceMs: int(env, "RECONNECT_GRACE_MS", 30000),
    heartbeatIntervalMs: int(env, "HEARTBEAT_INTERVAL_MS", 15000),
    heartbeatTimeoutMs: int(env, "HEARTBEAT_TIMEOUT_MS", 10000),
    tableLength: int(env, "TABLE_LENGTH", 5),
    handSize: int(env, "HAND_SIZE", 5),
    seed: seedRaw === undefined || seedRaw === "" ? null : int(env, "RNG_SEED", 0),
    logLevel,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): typed env configuration in one module"
```

---

### Task 15: Clock + Timers seam

The injectable time abstractions the room uses, plus a manual driver for tests so timing is deterministic — no `setTimeout` in tests.

**Files:**
- Create: `packages/server/src/lobby/timers.ts`
- Test: `packages/server/test/timers.test.ts`

**Interfaces:**
- Produces: `interface Clock { now(): number }`; `type Cancel = () => void`; `interface Timers { schedule(delayMs: number, cb: () => void): Cancel }`; `systemClock: Clock`; `systemTimers: Timers`; `manualTime(): { clock: Clock; timers: Timers; advance(ms: number): void }`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/timers.test.ts`:
```ts
import { expect, test, vi } from "vitest";
import { manualTime } from "../src/lobby/timers.js";

test("manual timers fire when time is advanced past their delay", () => {
  const { clock, timers, advance } = manualTime();
  const fired: string[] = [];
  timers.schedule(1000, () => fired.push("a"));
  timers.schedule(3000, () => fired.push("b"));
  advance(1000);
  expect(fired).toEqual(["a"]);
  expect(clock.now()).toBe(1000);
  advance(2000);
  expect(fired).toEqual(["a", "b"]);
});

test("a cancelled timer does not fire", () => {
  const { timers, advance } = manualTime();
  const cb = vi.fn();
  const cancel = timers.schedule(500, cb);
  cancel();
  advance(1000);
  expect(cb).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- timers`
Expected: FAIL — `../src/lobby/timers.js` not found.

- [ ] **Step 3: Implement `packages/server/src/lobby/timers.ts`**

```ts
export interface Clock {
  now(): number;
}

export type Cancel = () => void;

export interface Timers {
  schedule(delayMs: number, cb: () => void): Cancel;
}

export const systemClock: Clock = { now: () => Date.now() };

export const systemTimers: Timers = {
  schedule(delayMs, cb) {
    const handle = setTimeout(cb, delayMs);
    return () => clearTimeout(handle);
  },
};

interface Scheduled {
  at: number;
  cb: () => void;
  live: boolean;
}

export function manualTime(): { clock: Clock; timers: Timers; advance(ms: number): void } {
  let current = 0;
  const scheduled: Scheduled[] = [];

  const clock: Clock = { now: () => current };
  const timers: Timers = {
    schedule(delayMs, cb) {
      const entry: Scheduled = { at: current + delayMs, cb, live: true };
      scheduled.push(entry);
      return () => {
        entry.live = false;
      };
    },
  };

  function advance(ms: number): void {
    const target = current + ms;
    for (;;) {
      const due = scheduled
        .filter((s) => s.live && s.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      current = due.at;
      due.live = false;
      due.cb();
    }
    current = target;
  }

  return { clock, timers, advance };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- timers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): injectable clock and timers with a manual test driver"
```

---

### Task 16: Session

One connected client: stable identity, a session token for reconnection, connected flag, and an outbound send that no-ops while detached. The socket is swapped on reconnect; the `Session` (and its `id`) survive.

**Files:**
- Create: `packages/server/src/session/session.ts`
- Test: `packages/server/test/session.test.ts`

**Interfaces:**
- Consumes: `ServerMessage` (protocol).
- Produces: `type SendFn = (msg: ServerMessage) => void`; `class Session` with `readonly id: string`, `name: string`, `readonly token: string`, `connected: boolean`, `send(msg)`, `attach(send: SendFn)`, `detach()`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/session.test.ts`:
```ts
import { expect, test, vi } from "vitest";
import type { ServerMessage } from "@eat.io/protocol";
import { Session } from "../src/session/session.js";

const pong: ServerMessage = { type: "pong" };

test("send delivers while connected and no-ops while detached", () => {
  const sink = vi.fn();
  const s = new Session({ id: "p1", name: "Riley", token: "tok", send: sink });
  s.send(pong);
  s.detach();
  s.send(pong);
  expect(sink).toHaveBeenCalledTimes(1);
  expect(s.connected).toBe(false);
});

test("attach swaps the socket and marks connected again", () => {
  const first = vi.fn();
  const second = vi.fn();
  const s = new Session({ id: "p1", name: "Riley", token: "tok", send: first });
  s.detach();
  s.attach(second);
  s.send(pong);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(s.connected).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- session`
Expected: FAIL — `../src/session/session.js` not found.

- [ ] **Step 3: Implement `packages/server/src/session/session.ts`**

```ts
import type { ServerMessage } from "@eat.io/protocol";

export type SendFn = (msg: ServerMessage) => void;

export interface SessionInit {
  id: string;
  name: string;
  token: string;
  send: SendFn;
}

export class Session {
  readonly id: string;
  name: string;
  readonly token: string;
  connected = true;
  private sendFn: SendFn;

  constructor(init: SessionInit) {
    this.id = init.id;
    this.name = init.name;
    this.token = init.token;
    this.sendFn = init.send;
  }

  send(msg: ServerMessage): void {
    if (this.connected) this.sendFn(msg);
  }

  attach(send: SendFn): void {
    this.sendFn = send;
    this.connected = true;
  }

  detach(): void {
    this.connected = false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): session with reattachable socket for reconnection"
```

---

### Task 17: Room — turn loop

Wraps one `GameState`, seats two players, drives submit → accept/reject → resolve, arms the 20s move-deadline (auto-discard on expiry), broadcasts per-player views, and finishes with a per-player `gameOver`. All timing via the injected `Clock`/`Timers`, so tests are deterministic.

**Files:**
- Create: `packages/server/src/lobby/room.ts`
- Test: `packages/server/test/room.test.ts`

**Interfaces:**
- Consumes: engine ops + `viewFor`/`resultFor` (Tasks 7–11); `createGame` (Task 6); `Rules` (Task 5); `Clock`/`Timers`/`Cancel` (Task 15); `Submission`, `PlayerId`, `GameState` (Task 4); `Seat`, `ServerMessage`, `RoomPhase` (protocol); `Logger` (Task 13).
- Produces:
  - `interface RoomDeps { roomId; rules: Rules; roundCount; moveDeadlineMs; reconnectGraceMs; clock; timers; send: (playerId: PlayerId, msg: ServerMessage) => void; onFinished: (roomId: string) => void; logger: Logger; seed: number | null }`
  - `class Room` with `readonly id`, `get phase(): RoomPhase`, `isFull(): boolean`, `hasPlayer(id): boolean`, `addPlayer(playerId, name): void`, `submit(playerId, action: Submission): void`. (Disconnect/reconnect methods are added in Task 18.)

- [ ] **Step 1: Write the failing test**

`packages/server/test/room.test.ts`:
```ts
import { expect, test } from "vitest";
import type { PlayerId } from "../src/engine/state.js";
import type { RoomStateMessage } from "@eat.io/protocol";
import type { ServerMessage } from "@eat.io/protocol";
import { defaultRules } from "../src/engine/rules/index.js";
import { manualTime } from "../src/lobby/timers.js";
import { createLogger } from "../src/logger.js";
import { Room } from "../src/lobby/room.js";

function harness() {
  const sent: Record<string, ServerMessage[]> = { p1: [], p2: [] };
  const finished: string[] = [];
  const time = manualTime();
  const room = new Room({
    roomId: "r1",
    rules: defaultRules,
    roundCount: 10,
    moveDeadlineMs: 20000,
    reconnectGraceMs: 30000,
    clock: time.clock,
    timers: time.timers,
    send: (id, msg) => sent[id]!.push(msg),
    onFinished: (id) => finished.push(id),
    logger: createLogger("error"),
    seed: 5,
  });
  room.addPlayer("p1", "Riley");
  room.addPlayer("p2", "Sam");
  const lastState = (id: PlayerId): RoomStateMessage => {
    const states = sent[id]!.filter((m): m is RoomStateMessage => m.type === "roomState");
    return states[states.length - 1]!;
  };
  return { sent, finished, time, room, lastState };
}

test("starting seats two players and broadcasts an in-progress view with a deadline", () => {
  const h = harness();
  expect(h.room.phase).toBe("in-progress");
  const v = h.lastState("p1");
  expect(v.you.seat).toBe("a");
  expect(v.opponent.seat).toBe("b");
  expect(v.deadlineAt).toBe(20000); // clock started at 0
});

test("a legal submit is accepted and reflected; an illegal one is rejected", () => {
  const h = harness();
  const v = h.lastState("p1");
  const card = v.you.hand.find((c) => c.targets === 1)!;
  const tray = v.you.table[0]!;
  h.room.submit("p1", { cardId: card.id, targetTrayIds: [tray.id] });
  expect(h.sent["p1"]!.some((m) => m.type === "actionAccepted")).toBe(true);
  expect(h.lastState("p1").you.submitted).toBe(true);

  h.room.submit("p2", { cardId: "no-such-card", targetTrayIds: [] });
  const rej = h.sent["p2"]!.find((m) => m.type === "actionRejected");
  expect(rej).toMatchObject({ type: "actionRejected", code: "CARD_NOT_HELD" });
});

test("when both submit, the round resolves and roundIndex advances", () => {
  const h = harness();
  for (const id of ["p1", "p2"] as const) {
    const v = h.lastState(id);
    const card = v.you.hand.find((c) => c.targets === 1)!;
    h.room.submit(id, { cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
  }
  expect(h.lastState("p1").roundIndex).toBe(1);
});

test("an expired deadline auto-discards for the idle player and resolves", () => {
  const h = harness();
  const v = h.lastState("p1");
  const card = v.you.hand.find((c) => c.targets === 1)!;
  h.room.submit("p1", { cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
  // p2 never submits; advance past the 20s deadline
  h.time.advance(20000);
  expect(h.lastState("p1").roundIndex).toBe(1);
});

test("the game ends after roundCount rounds with a per-player gameOver", () => {
  const h = harness();
  for (let r = 0; r < 10; r++) {
    for (const id of ["p1", "p2"] as const) {
      const v = h.lastState(id);
      const card = v.you.hand.find((c) => c.targets === 1)!;
      h.room.submit(id, { cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
    }
  }
  expect(h.room.phase).toBe("finished");
  expect(h.sent["p1"]!.some((m) => m.type === "gameOver")).toBe(true);
  expect(h.sent["p2"]!.some((m) => m.type === "gameOver")).toBe(true);
  expect(h.finished).toContain("r1");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- room`
Expected: FAIL — `../src/lobby/room.js` not found.

- [ ] **Step 3: Implement `packages/server/src/lobby/room.ts`**

```ts
import type { PlayerId, GameState, Submission } from "../engine/state.js";
import type { Rules } from "../engine/rules/index.js";
import type { Cancel, Clock, Timers } from "./timers.js";
import type { Logger } from "../logger.js";
import type { RoomPhase, Seat, ServerMessage } from "@eat.io/protocol";
import { createGame } from "../engine/deal.js";
import {
  applyAction,
  autoMove,
  everyoneSubmitted,
  isGameOver,
  rankResult,
  resolveRound,
  resultFor,
  validateAction,
  viewFor,
} from "../engine/engine.js";

export interface RoomDeps {
  roomId: string;
  rules: Rules;
  roundCount: number;
  moveDeadlineMs: number;
  reconnectGraceMs: number;
  clock: Clock;
  timers: Timers;
  send: (playerId: PlayerId, msg: ServerMessage) => void;
  onFinished: (roomId: string) => void;
  logger: Logger;
  seed: number | null;
}

interface SeatRef {
  id: PlayerId;
  seat: Seat;
  name: string;
}

const SEATS: readonly Seat[] = ["a", "b"];

export class Room {
  readonly id: string;
  private state: GameState | null = null;
  private seats: SeatRef[] = [];
  private deadlineAt: number | null = null;
  protected cancelDeadline: Cancel | null = null;
  protected disconnected = new Set<PlayerId>();

  constructor(protected readonly deps: RoomDeps) {
    this.id = deps.roomId;
  }

  get phase(): RoomPhase {
    return this.state?.phase ?? "waiting";
  }

  isFull(): boolean {
    return this.seats.length >= 2;
  }

  hasPlayer(id: PlayerId): boolean {
    return this.seats.some((s) => s.id === id);
  }

  addPlayer(playerId: PlayerId, name: string): void {
    if (this.isFull() || this.hasPlayer(playerId)) return;
    this.seats.push({ id: playerId, seat: SEATS[this.seats.length]!, name });
    if (this.isFull()) this.start();
  }

  submit(playerId: PlayerId, action: Submission): void {
    if (!this.state) return;
    const verdict = validateAction(this.state, playerId, action);
    if (!verdict.ok) {
      this.deps.send(playerId, { type: "actionRejected", code: verdict.code, message: verdict.message });
      return;
    }
    this.state = applyAction(this.state, playerId, action);
    this.deps.send(playerId, { type: "actionAccepted" });
    this.broadcast();
    this.tryResolve();
  }

  protected start(): void {
    this.state = createGame({
      roomId: this.id,
      seats: this.seats,
      rules: this.deps.rules,
      roundCount: this.deps.roundCount,
      seed: this.deps.seed ?? Math.floor(Math.random() * 0x7fffffff),
    });
    this.armDeadline();
    this.broadcast();
    this.deps.logger.info("room started", { roomId: this.id });
  }

  protected armDeadline(): void {
    this.cancelDeadline?.();
    this.deadlineAt = this.deps.clock.now() + this.deps.moveDeadlineMs;
    this.cancelDeadline = this.deps.timers.schedule(this.deps.moveDeadlineMs, () => this.onDeadline());
  }

  protected clearDeadline(): void {
    this.cancelDeadline?.();
    this.cancelDeadline = null;
    this.deadlineAt = null;
  }

  private onDeadline(): void {
    if (!this.state || this.state.phase !== "in-progress") return;
    for (const s of this.seats) {
      const p = this.state.players[s.id];
      if (p && p.connected && !p.submission) this.state = autoMove(this.state, s.id);
    }
    this.tryResolve();
  }

  private tryResolve(): void {
    if (!this.state || !everyoneSubmitted(this.state)) return;
    this.clearDeadline();
    const { state } = resolveRound(this.state, this.deps.rules);
    this.state = state;
    if (isGameOver(this.state)) {
      this.finish();
      return;
    }
    this.armDeadline();
    this.broadcast();
  }

  protected broadcast(): void {
    if (!this.state) return;
    for (const s of this.seats) {
      this.deps.send(s.id, viewFor(this.state, s.id, this.deadlineAt));
    }
  }

  protected finish(): void {
    if (!this.state) return;
    this.clearDeadline();
    this.state = { ...this.state, phase: "finished" };
    const ranked = rankResult(this.state);
    for (const s of this.seats) {
      this.deps.send(s.id, viewFor(this.state, s.id, null));
      this.deps.send(s.id, { type: "gameOver", result: resultFor(ranked, s.seat) });
    }
    this.deps.onFinished(this.id);
    this.deps.logger.info("room finished", { roomId: this.id });
  }

  protected opponentOf(playerId: PlayerId): SeatRef | undefined {
    return this.seats.find((s) => s.id !== playerId);
  }
}
```

Note: `start`, `armDeadline`, `broadcast`, `finish`, `opponentOf`, `clearDeadline`, and the `state`/`deadlineAt`/`disconnected`/`cancelDeadline` fields are `protected` because Task 18 adds disconnect/reconnect behavior in the same class. `state` and `deadlineAt` stay `private`? They are declared `private`/fields above; Task 18 adds methods to THIS class (same file), so private access is fine — the "protected" markers exist only to document the extension points.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- room`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lobby): room turn loop — submit, resolve, deadline auto-discard, gameOver"
```

---

### Task 18: Room — disconnect, pause, reconnection, abandon

The second timing mechanism (distinct from the idle deadline). A disconnect pauses the room and suspends the move clock; reconnect within 30s resumes; grace expiry (or a voluntary leave) abandons.

**Files:**
- Modify: `packages/server/src/engine/engine.ts` (append `setConnected`)
- Modify: `packages/server/src/lobby/room.ts` (add methods + a `cancelGrace` field to the `Room` class)
- Test: `packages/server/test/reconnect.test.ts`

**Interfaces:**
- Produces (engine): `setConnected(state: GameState, playerId: PlayerId, connected: boolean): GameState`.
- Produces (Room): `markDisconnected(playerId): void`; `markReconnected(playerId): void`; `leave(playerId): void`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/reconnect.test.ts`:
```ts
import { expect, test } from "vitest";
import type { RoomStateMessage, ServerMessage } from "@eat.io/protocol";
import type { PlayerId } from "../src/engine/state.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { manualTime } from "../src/lobby/timers.js";
import { createLogger } from "../src/logger.js";
import { Room } from "../src/lobby/room.js";

function harness() {
  const sent: Record<string, ServerMessage[]> = { p1: [], p2: [] };
  const finished: string[] = [];
  const time = manualTime();
  const room = new Room({
    roomId: "r1", rules: defaultRules, roundCount: 10,
    moveDeadlineMs: 20000, reconnectGraceMs: 30000,
    clock: time.clock, timers: time.timers,
    send: (id, msg) => sent[id]!.push(msg),
    onFinished: (id) => finished.push(id),
    logger: createLogger("error"), seed: 5,
  });
  room.addPlayer("p1", "Riley");
  room.addPlayer("p2", "Sam");
  const last = (id: PlayerId, type: string) => {
    const ms = sent[id]!.filter((m) => m.type === type);
    return ms[ms.length - 1];
  };
  return { sent, finished, time, room, last };
}

test("a disconnect pauses the room and notifies the opponent with a grace deadline", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  expect(h.room.phase).toBe("paused");
  expect(h.last("p2", "opponentDisconnected")).toMatchObject({ type: "opponentDisconnected", graceEndsAt: 30000 });
});

test("the move clock is suspended while paused", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  h.time.advance(20000); // would have fired the move deadline if it were still armed
  expect(h.room.phase).toBe("paused"); // no resolution happened
});

test("reconnect within grace resumes and re-broadcasts", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  h.time.advance(10000);
  h.room.markReconnected("p1");
  expect(h.room.phase).toBe("in-progress");
  expect(h.last("p2", "opponentReconnected")).toEqual({ type: "opponentReconnected" });
  expect((h.last("p1", "roomState") as RoomStateMessage).phase).toBe("in-progress");
});

test("grace expiry abandons the room and the survivor sees phase abandoned", () => {
  const h = harness();
  h.room.markDisconnected("p1");
  h.time.advance(30000);
  expect(h.room.phase).toBe("abandoned");
  expect((h.last("p2", "roomState") as RoomStateMessage).phase).toBe("abandoned");
  expect(h.finished).toContain("r1");
});

test("a voluntary leave abandons immediately", () => {
  const h = harness();
  h.room.leave("p1");
  expect(h.room.phase).toBe("abandoned");
  expect(h.finished).toContain("r1");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- reconnect`
Expected: FAIL — `markDisconnected` etc. not defined.

- [ ] **Step 3: Append `setConnected` to `packages/server/src/engine/engine.ts`**

```ts
export function setConnected(state: GameState, playerId: PlayerId, connected: boolean): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, connected } } };
}
```

- [ ] **Step 4: Add to the `Room` class in `packages/server/src/lobby/room.ts`**

Add `setConnected` to the engine import list at the top of the file. Add a field to the class:
```ts
  private cancelGrace: Cancel | null = null;
```
Add these methods to the class:
```ts
  markDisconnected(playerId: PlayerId): void {
    if (!this.state) {
      // Was still waiting for a second player; nothing to play, reap it.
      this.deps.onFinished(this.id);
      return;
    }
    if (this.state.phase === "finished" || this.state.phase === "abandoned") return;

    this.disconnected.add(playerId);
    this.state = setConnected(this.state, playerId, false);
    this.state = { ...this.state, phase: "paused" };
    this.clearDeadline();

    const graceEndsAt = this.deps.clock.now() + this.deps.reconnectGraceMs;
    const opponent = this.opponentOf(playerId);
    if (opponent) this.deps.send(opponent.id, { type: "opponentDisconnected", graceEndsAt });
    this.cancelGrace?.();
    this.cancelGrace = this.deps.timers.schedule(this.deps.reconnectGraceMs, () => this.abandon());
    this.deps.logger.info("player disconnected; room paused", { roomId: this.id, playerId });
  }

  markReconnected(playerId: PlayerId): void {
    if (!this.state || this.state.phase !== "paused") return;
    if (!this.disconnected.has(playerId)) return;

    this.disconnected.delete(playerId);
    this.state = setConnected(this.state, playerId, true);

    if (this.disconnected.size === 0) {
      this.cancelGrace?.();
      this.cancelGrace = null;
      this.state = { ...this.state, phase: "in-progress" };
      const opponent = this.opponentOf(playerId);
      if (opponent) this.deps.send(opponent.id, { type: "opponentReconnected" });
      this.armDeadline();
    }
    this.broadcast();
    this.deps.logger.info("player reconnected", { roomId: this.id, playerId });
  }

  leave(playerId: PlayerId): void {
    if (!this.state) {
      this.deps.onFinished(this.id);
      return;
    }
    this.abandon();
  }

  private abandon(): void {
    if (!this.state) {
      this.deps.onFinished(this.id);
      return;
    }
    if (this.state.phase === "finished" || this.state.phase === "abandoned") return;
    this.clearDeadline();
    this.cancelGrace?.();
    this.cancelGrace = null;
    this.state = { ...this.state, phase: "abandoned" };
    for (const s of this.seats) {
      const p = this.state.players[s.id];
      if (p?.connected) this.deps.send(s.id, viewFor(this.state, s.id, null));
    }
    this.deps.onFinished(this.id);
    this.deps.logger.info("room abandoned", { roomId: this.id });
  }
```

(`viewFor` is already imported in Task 17; keep the import.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- reconnect && npm test -- room`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(lobby): disconnect pause, 30s reconnection grace, abandon"
```

---

### Task 19: Room registry

Holds many concurrent rooms and hands out ids. Reaping is just `delete`, called from a room's `onFinished`.

**Files:**
- Create: `packages/server/src/lobby/registry.ts`
- Test: `packages/server/test/registry.test.ts`

**Interfaces:**
- Consumes: `Room` (Task 17) — only its `id`.
- Produces: `class RoomRegistry` with `nextRoomId(): string`, `add(room: Room): void`, `get(id): Room | undefined`, `delete(id): void`, `get size(): number`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/registry.test.ts`:
```ts
import { expect, test } from "vitest";
import type { Room } from "../src/lobby/room.js";
import { RoomRegistry } from "../src/lobby/registry.js";

const fakeRoom = (id: string) => ({ id }) as unknown as Room;

test("ids are unique and rooms can be added, fetched, and reaped", () => {
  const reg = new RoomRegistry();
  const id1 = reg.nextRoomId();
  const id2 = reg.nextRoomId();
  expect(id1).not.toBe(id2);

  reg.add(fakeRoom(id1));
  reg.add(fakeRoom(id2));
  expect(reg.size).toBe(2);
  expect(reg.get(id1)?.id).toBe(id1);

  reg.delete(id1);
  expect(reg.size).toBe(1);
  expect(reg.get(id1)).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- registry`
Expected: FAIL — `../src/lobby/registry.js` not found.

- [ ] **Step 3: Implement `packages/server/src/lobby/registry.ts`**

```ts
import type { Room } from "./room.js";

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private seq = 0;

  nextRoomId(): string {
    this.seq += 1;
    return `room-${this.seq}`;
  }

  add(room: Room): void {
    this.rooms.set(room.id, room);
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  delete(id: string): void {
    this.rooms.delete(id);
  }

  get size(): number {
    return this.rooms.size;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- registry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lobby): room registry with reaping"
```

---

### Task 20: Matchmaker

Pure pairing logic: a public queue and private rooms by code. Returns decisions; the Lobby (Task 21) acts on them. The code generator is injected so tests are deterministic.

**Files:**
- Create: `packages/server/src/lobby/matchmaking.ts`
- Test: `packages/server/test/matchmaking.test.ts`

**Interfaces:**
- Consumes: `PlayerId` (Task 4).
- Produces: `class Matchmaker` constructed with `(genCode: () => string)`; methods:
  - `joinPublic(playerId): { paired: true; opponent: PlayerId } | { paired: false }`
  - `cancelPublic(playerId): void`
  - `createPrivate(playerId): string` (returns the code)
  - `joinPrivate(playerId, code): { ok: true; host: PlayerId } | { ok: false; reason: string }`
  - `remove(playerId): void` (drop from queue and any owned private room — used on disconnect)

- [ ] **Step 1: Write the failing test**

`packages/server/test/matchmaking.test.ts`:
```ts
import { expect, test } from "vitest";
import { Matchmaker } from "../src/lobby/matchmaking.js";

test("public queue pairs the second arrival with the first", () => {
  const mm = new Matchmaker(() => "CODE");
  expect(mm.joinPublic("p1")).toEqual({ paired: false });
  expect(mm.joinPublic("p2")).toEqual({ paired: true, opponent: "p1" });
  // queue now empty — a third waits again
  expect(mm.joinPublic("p3")).toEqual({ paired: false });
});

test("cancel removes a waiting player", () => {
  const mm = new Matchmaker(() => "CODE");
  mm.joinPublic("p1");
  mm.cancelPublic("p1");
  expect(mm.joinPublic("p2")).toEqual({ paired: false });
});

test("private room joins by code and rejects unknown or self", () => {
  const mm = new Matchmaker(() => "ABCD");
  const code = mm.createPrivate("host");
  expect(code).toBe("ABCD");
  expect(mm.joinPrivate("host", "ABCD")).toEqual({ ok: false, reason: "cannot join your own room" });
  expect(mm.joinPrivate("guest", "ZZZZ")).toEqual({ ok: false, reason: "no such room" });
  expect(mm.joinPrivate("guest", "ABCD")).toEqual({ ok: true, host: "host" });
  // code consumed
  expect(mm.joinPrivate("late", "ABCD")).toEqual({ ok: false, reason: "no such room" });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- matchmaking`
Expected: FAIL — `../src/lobby/matchmaking.js` not found.

- [ ] **Step 3: Implement `packages/server/src/lobby/matchmaking.ts`**

```ts
import type { PlayerId } from "../engine/state.js";

export class Matchmaker {
  private queue: PlayerId[] = [];
  private privateRooms = new Map<string, PlayerId>(); // code -> host

  constructor(private readonly genCode: () => string) {}

  joinPublic(playerId: PlayerId): { paired: true; opponent: PlayerId } | { paired: false } {
    const waiting = this.queue.find((id) => id !== playerId);
    if (waiting) {
      this.queue = this.queue.filter((id) => id !== waiting);
      return { paired: true, opponent: waiting };
    }
    if (!this.queue.includes(playerId)) this.queue.push(playerId);
    return { paired: false };
  }

  cancelPublic(playerId: PlayerId): void {
    this.queue = this.queue.filter((id) => id !== playerId);
  }

  createPrivate(playerId: PlayerId): string {
    let code = this.genCode();
    while (this.privateRooms.has(code)) code = this.genCode();
    this.privateRooms.set(code, playerId);
    return code;
  }

  joinPrivate(
    playerId: PlayerId,
    code: string,
  ): { ok: true; host: PlayerId } | { ok: false; reason: string } {
    const host = this.privateRooms.get(code);
    if (!host) return { ok: false, reason: "no such room" };
    if (host === playerId) return { ok: false, reason: "cannot join your own room" };
    this.privateRooms.delete(code);
    return { ok: true, host };
  }

  remove(playerId: PlayerId): void {
    this.cancelPublic(playerId);
    for (const [code, host] of this.privateRooms) {
      if (host === playerId) this.privateRooms.delete(code);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- matchmaking`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lobby): matchmaker — public queue and private rooms by code"
```

---

### Task 21: Lobby coordinator

The transport-agnostic brain. Owns sessions (by id and by token), routes every `ClientMessage`, creates rooms on a pairing, and handles connect/disconnect/reconnect. Tested with fake in-memory connections — no sockets.

**Files:**
- Create: `packages/server/src/lobby/lobby.ts`
- Test: `packages/server/test/lobby.test.ts`

**Interfaces:**
- Consumes: `Session`/`SendFn` (Task 16); `Matchmaker` (Task 20); `RoomRegistry` (Task 19); `Room` (Tasks 17–18); `Config` (Task 14); `Rules` (Task 5); `Clock`/`Timers` (Task 15); `Logger` (Task 13); `ClientMessage`/`ServerMessage`/`PROTOCOL_VERSION` (protocol); `PlayerId` (Task 4).
- Produces:
  - `interface Connection { send: SendFn; session: Session | null }`
  - `interface LobbyDeps { config: Config; rules: Rules; clock: Clock; timers: Timers; registry: RoomRegistry; matchmaker: Matchmaker; logger: Logger; genId: () => string; genToken: () => string }`
  - `class Lobby` with `handleMessage(conn: Connection, msg: ClientMessage): void` and `handleClose(conn: Connection): void`.

- [ ] **Step 1: Write the failing test**

`packages/server/test/lobby.test.ts`:
```ts
import { expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomStateMessage,
  type ServerMessage,
  type WelcomeMessage,
} from "@eat.io/protocol";
import { defaultRules } from "../src/engine/rules/index.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { manualTime } from "../src/lobby/timers.js";
import { Matchmaker } from "../src/lobby/matchmaking.js";
import { RoomRegistry } from "../src/lobby/registry.js";
import { Lobby, type Connection } from "../src/lobby/lobby.js";

function makeLobby() {
  const time = manualTime();
  let idSeq = 0, tokSeq = 0, codeSeq = 0;
  const lobby = new Lobby({
    config: loadConfig({ RNG_SEED: "5" }),
    rules: defaultRules,
    clock: time.clock,
    timers: time.timers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(() => `C${++codeSeq}`),
    logger: createLogger("error"),
    genId: () => `player-${++idSeq}`,
    genToken: () => `tok-${++tokSeq}`,
  });
  return { lobby, time };
}

function conn() {
  const out: ServerMessage[] = [];
  const c: Connection = { send: (m) => out.push(m), session: null };
  return { c, out };
}

const hello = (name: string, sessionToken?: string): ClientMessage =>
  sessionToken
    ? { type: "hello", protocolVersion: PROTOCOL_VERSION, name, sessionToken }
    : { type: "hello", protocolVersion: PROTOCOL_VERSION, name };

const lastOf = (out: ServerMessage[], type: ServerMessage["type"]) =>
  [...out].reverse().find((m) => m.type === type);

test("hello mints a session and returns welcome", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  const welcome = a.out[0] as WelcomeMessage;
  expect(welcome.type).toBe("welcome");
  expect(a.c.session?.id).toBe(welcome.playerId);
});

test("a protocol version mismatch is rejected", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, { type: "hello", protocolVersion: 999, name: "Riley" });
  expect(a.out[0]).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH" });
});

test("public queue pairs two players into a live room", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  expect(lastOf(a.out, "queueWaiting")).toBeDefined();
  lobby.handleMessage(b.c, { type: "queueJoin" });
  expect(lastOf(a.out, "roomState")).toBeDefined();
  expect(lastOf(b.out, "roomState")).toBeDefined();
});

test("submitTurn is routed to the player's room", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });
  const v = lastOf(a.out, "roomState") as RoomStateMessage;
  const card = v.you.hand.find((c) => c.targets === 1)!;
  lobby.handleMessage(a.c, { type: "submitTurn", cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
  expect(lastOf(a.out, "actionAccepted")).toBeDefined();
});

test("submitTurn with no room is explicitly rejected", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(a.c, { type: "submitTurn", cardId: "x", targetTrayIds: [] });
  expect(lastOf(a.out, "actionRejected")).toMatchObject({ code: "NOT_IN_ROOM" });
});

test("ping is answered with pong", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(a.c, { type: "ping" });
  expect(lastOf(a.out, "pong")).toEqual({ type: "pong" });
});

test("a dropped player can reconnect with their token and resume the room", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  const token = (a.out[0] as WelcomeMessage).sessionToken;
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });

  lobby.handleClose(a.c); // p1 drops
  expect(lastOf(b.out, "opponentDisconnected")).toBeDefined();

  const a2 = conn();
  lobby.handleMessage(a2.c, hello("Riley", token));
  expect(a2.out[0]).toMatchObject({ type: "welcome" });
  expect(lastOf(b.out, "opponentReconnected")).toBeDefined();
  expect((lastOf(a2.out, "roomState") as RoomStateMessage).phase).toBe("in-progress");
});

test("private room: host gets a code, guest joins it", () => {
  const { lobby } = makeLobby();
  const host = conn(); const guest = conn();
  lobby.handleMessage(host.c, hello("Riley"));
  lobby.handleMessage(guest.c, hello("Sam"));
  lobby.handleMessage(host.c, { type: "roomCreatePrivate" });
  const joined = lastOf(host.out, "roomJoinedPrivate") as { type: "roomJoinedPrivate"; code: string };
  expect(joined.code).toBe("C1");
  lobby.handleMessage(guest.c, { type: "roomJoinPrivate", code: "C1" });
  expect(lastOf(host.out, "roomState")).toBeDefined();
  expect(lastOf(guest.out, "roomState")).toBeDefined();
});
```

> The test imports `WelcomeMessage` and `RoomStateMessage` types. Add these named type exports to `packages/protocol/src/messages.ts` if not already present:
> ```ts
> export type WelcomeMessage = z.infer<typeof WelcomeSchema>;
> ```
> (`RoomStateMessage` already exists from Task 3.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- lobby`
Expected: FAIL — `../src/lobby/lobby.js` not found.

- [ ] **Step 3: Add the `WelcomeMessage` type export to `packages/protocol/src/messages.ts`**

```ts
export type WelcomeMessage = z.infer<typeof WelcomeSchema>;
```

- [ ] **Step 4: Implement `packages/server/src/lobby/lobby.ts`**

```ts
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import type { PlayerId } from "../engine/state.js";
import type { Rules } from "../engine/rules/index.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { Clock, Timers } from "./timers.js";
import { Session, type SendFn } from "../session/session.js";
import { Matchmaker } from "./matchmaking.js";
import { RoomRegistry } from "./registry.js";
import { Room } from "./room.js";

export interface Connection {
  send: SendFn;
  session: Session | null;
}

export interface LobbyDeps {
  config: Config;
  rules: Rules;
  clock: Clock;
  timers: Timers;
  registry: RoomRegistry;
  matchmaker: Matchmaker;
  logger: Logger;
  genId: () => string;
  genToken: () => string;
}

export class Lobby {
  private sessions = new Map<string, Session>();
  private byToken = new Map<string, Session>();
  private playerRoom = new Map<PlayerId, string>();

  constructor(private readonly deps: LobbyDeps) {}

  handleMessage(conn: Connection, msg: ClientMessage): void {
    if (msg.type === "hello") {
      this.handleHello(conn, msg);
      return;
    }
    const session = conn.session;
    if (!session) {
      conn.send({ type: "error", code: "NO_SESSION", message: "Send hello before anything else." });
      return;
    }
    const playerId = session.id;
    switch (msg.type) {
      case "ping":
        session.send({ type: "pong" });
        break;
      case "queueJoin": {
        const result = this.deps.matchmaker.joinPublic(playerId);
        if (result.paired) this.startRoom(result.opponent, playerId);
        else this.sendTo(playerId, { type: "queueWaiting" });
        break;
      }
      case "queueCancel":
        this.deps.matchmaker.cancelPublic(playerId);
        break;
      case "roomCreatePrivate":
        session.send({ type: "roomJoinedPrivate", code: this.deps.matchmaker.createPrivate(playerId) });
        break;
      case "roomJoinPrivate": {
        const result = this.deps.matchmaker.joinPrivate(playerId, msg.code);
        if (result.ok) this.startRoom(result.host, playerId);
        else this.sendTo(playerId, { type: "error", code: "NO_SUCH_ROOM", message: result.reason });
        break;
      }
      case "submitTurn": {
        const room = this.roomOf(playerId);
        if (!room) {
          this.sendTo(playerId, { type: "actionRejected", code: "NOT_IN_ROOM", message: "You are not in a game." });
          break;
        }
        room.submit(playerId, { cardId: msg.cardId, targetTrayIds: msg.targetTrayIds });
        break;
      }
      case "roomLeave": {
        this.deps.matchmaker.remove(playerId);
        this.roomOf(playerId)?.leave(playerId);
        break;
      }
      default: {
        const never: never = msg;
        void never;
      }
    }
  }

  handleClose(conn: Connection): void {
    const session = conn.session;
    if (!session) return;
    session.detach();
    this.deps.matchmaker.remove(session.id);
    const room = this.roomOf(session.id);
    if (room) room.markDisconnected(session.id);
    else this.dropSession(session);
  }

  private handleHello(conn: Connection, msg: Extract<ClientMessage, { type: "hello" }>): void {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      conn.send({ type: "error", code: "PROTOCOL_MISMATCH", message: `Server speaks protocol ${PROTOCOL_VERSION}.` });
      return;
    }
    if (msg.sessionToken) {
      const existing = this.byToken.get(msg.sessionToken);
      if (existing) {
        existing.attach(conn.send);
        conn.session = existing;
        existing.send({ type: "welcome", playerId: existing.id, sessionToken: existing.token });
        this.roomOf(existing.id)?.markReconnected(existing.id);
        this.deps.logger.info("session reconnected", { playerId: existing.id });
        return;
      }
      // Unknown/expired token — fall through and mint a fresh session.
    }
    const id = this.deps.genId();
    const token = this.deps.genToken();
    const session = new Session({ id, name: msg.name, token, send: conn.send });
    this.sessions.set(id, session);
    this.byToken.set(token, session);
    conn.session = session;
    session.send({ type: "welcome", playerId: id, sessionToken: token });
    this.deps.logger.info("session created", { playerId: id });
  }

  private startRoom(aId: PlayerId, bId: PlayerId): void {
    const roomId = this.deps.registry.nextRoomId();
    const room = new Room({
      roomId,
      rules: this.deps.rules,
      roundCount: this.deps.config.roundCount,
      moveDeadlineMs: this.deps.config.moveDeadlineMs,
      reconnectGraceMs: this.deps.config.reconnectGraceMs,
      clock: this.deps.clock,
      timers: this.deps.timers,
      send: (pid, m) => this.sendTo(pid, m),
      onFinished: (rid) => this.reap(rid),
      logger: this.deps.logger,
      seed: this.deps.config.seed,
    });
    this.deps.registry.add(room);
    this.playerRoom.set(aId, roomId);
    this.playerRoom.set(bId, roomId);
    room.addPlayer(aId, this.sessions.get(aId)?.name ?? "Player");
    room.addPlayer(bId, this.sessions.get(bId)?.name ?? "Player");
  }

  private reap(roomId: string): void {
    this.deps.registry.delete(roomId);
    for (const [pid, rid] of [...this.playerRoom]) {
      if (rid !== roomId) continue;
      this.playerRoom.delete(pid);
      const session = this.sessions.get(pid);
      if (session && !session.connected) this.dropSession(session);
    }
  }

  private roomOf(playerId: PlayerId): Room | undefined {
    const roomId = this.playerRoom.get(playerId);
    return roomId ? this.deps.registry.get(roomId) : undefined;
  }

  private sendTo(playerId: PlayerId, msg: ServerMessage): void {
    this.sessions.get(playerId)?.send(msg);
  }

  private dropSession(session: Session): void {
    this.sessions.delete(session.id);
    this.byToken.delete(session.token);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lobby`
Expected: PASS (all eight cases).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(lobby): coordinator — sessions, routing, matchmaking, reconnection"
```

---

### Task 22: Transport — WebSocket server

Accepts sockets, decodes and schema-validates every inbound frame before the lobby sees it, runs ping/pong heartbeats, and routes to the lobby. A handler exception is caught here so one bad message can never crash the process (§0.4, §1.7).

**Files:**
- Create: `packages/server/src/transport/server.ts`
- Test: `packages/server/test/transport.test.ts`

**Interfaces:**
- Consumes: `parseClientMessage`, `ClientMessage`, `ServerMessage` (protocol); `Connection` (Task 21); `Config` (Task 14); `Logger` (Task 13); `ws`.
- Produces:
  - `interface LobbyLike { handleMessage(conn: Connection, msg: ClientMessage): void; handleClose(conn: Connection): void }` (the real `Lobby` satisfies this structurally)
  - `interface Transport { readonly port: number; close(): Promise<void> }`
  - `startTransport(deps: { lobby: LobbyLike; config: Config; logger: Logger }): Promise<Transport>` (resolves once listening; use `config.port = 0` for an ephemeral port in tests)

- [ ] **Step 1: Write the failing test**

`packages/server/test/transport.test.ts`:
```ts
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { startTransport, type Transport, type LobbyLike } from "../src/transport/server.js";
import type { Connection } from "../src/lobby/lobby.js";

let transport: Transport | undefined;
afterEach(async () => { await transport?.close(); transport = undefined; });

function recordingLobby() {
  const messages: ClientMessage[] = [];
  let closed = 0;
  const lobby: LobbyLike = {
    handleMessage: (_conn: Connection, msg) => { messages.push(msg); },
    handleClose: () => { closed++; },
  };
  return { lobby, messages, closedCount: () => closed };
}

function open(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox: ServerMessage[] = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  return { ws, inbox, ready: new Promise<void>((res) => ws.on("open", () => res())) };
}

const nextTick = () => new Promise((r) => setTimeout(r, 20));

test("malformed JSON gets a typed error and does not reach the lobby", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const c = open(transport.port);
  await c.ready;
  c.ws.send("{not json");
  await nextTick();
  expect(c.inbox[0]).toMatchObject({ type: "error", code: "BAD_JSON" });
  expect(rec.messages).toHaveLength(0);
});

test("a schema-invalid message is rejected with a typed error", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const c = open(transport.port);
  await c.ready;
  c.ws.send(JSON.stringify({ type: "definitelyNotAMessage" }));
  await nextTick();
  expect(c.inbox[0]).toMatchObject({ type: "error", code: "BAD_MESSAGE" });
  expect(rec.messages).toHaveLength(0);
});

test("a valid message reaches the lobby; closing calls handleClose", async () => {
  const rec = recordingLobby();
  transport = await startTransport({ lobby: rec.lobby, config: loadConfig({ PORT: "0" }), logger: createLogger("error") });
  const c = open(transport.port);
  await c.ready;
  c.ws.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" }));
  await nextTick();
  expect(rec.messages[0]).toMatchObject({ type: "hello", name: "Riley" });
  c.ws.close();
  await nextTick();
  expect(rec.closedCount()).toBe(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- transport`
Expected: FAIL — `../src/transport/server.js` not found.

- [ ] **Step 3: Implement `packages/server/src/transport/server.ts`**

```ts
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "@eat.io/protocol";
import type { Connection } from "../lobby/lobby.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

export interface LobbyLike {
  handleMessage(conn: Connection, msg: ClientMessage): void;
  handleClose(conn: Connection): void;
}

export interface Transport {
  readonly port: number;
  close(): Promise<void>;
}

export function startTransport(deps: {
  lobby: LobbyLike;
  config: Config;
  logger: Logger;
}): Promise<Transport> {
  const { lobby, config, logger } = deps;
  const wss = new WebSocketServer({ port: config.port });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (socket) => {
    const conn: Connection = {
      send: (msg: ServerMessage) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
      },
      session: null,
    };
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));

    socket.on("message", (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        conn.send({ type: "error", code: "BAD_JSON", message: "Message was not valid JSON." });
        return;
      }
      let msg: ClientMessage;
      try {
        msg = parseClientMessage(raw);
      } catch (err) {
        conn.send({ type: "error", code: "BAD_MESSAGE", message: "Message failed validation." });
        logger.debug("rejected invalid message", { err: String(err) });
        return;
      }
      try {
        lobby.handleMessage(conn, msg); // one bad handler call must not crash the process
      } catch (err) {
        logger.error("handler threw", { err: String(err) });
      }
    });

    socket.on("close", () => lobby.handleClose(conn));
    socket.on("error", (err) => logger.warn("socket error", { err: String(err) }));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, config.heartbeatIntervalMs);
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));

  return new Promise<Transport>((resolve) => {
    wss.on("listening", () => {
      const port = (wss.address() as AddressInfo).port;
      logger.info("listening", { port });
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => {
            clearInterval(heartbeat);
            for (const socket of wss.clients) socket.terminate();
            wss.close(() => res());
          }),
      });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- transport`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(transport): ws server with schema validation, heartbeats, safe routing"
```

---

### Task 23: Composition root + end-to-end proof

Wires every layer, starts the server, handles graceful shutdown, and proves the whole stack with two real WebSocket clients playing a full game.

**Files:**
- Create: `packages/server/src/index.ts`
- Test: `packages/server/test/e2e.test.ts`

**Interfaces:**
- Consumes: everything. Exports a testable `createServer(config): Promise<Transport>` and runs it when executed directly.

- [ ] **Step 1: Write the failing end-to-end test**

`packages/server/test/e2e.test.ts`:
```ts
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type RoomStateMessage, type ServerMessage } from "@eat.io/protocol";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/index.js";
import type { Transport } from "../src/transport/server.js";

let transport: Transport | undefined;
afterEach(async () => { await transport?.close(); transport = undefined; });

function client(port: number, name: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  let cursor = 0; // consuming pointer, so a match from a prior round is never reused
  ws.on("message", (d) => { inbox.push(JSON.parse(d.toString())); waiters.splice(0).forEach((w) => w()); });
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const open = new Promise<void>((r) => ws.on("open", () => r()));
  // Waits for the NEXT (not any past) message matching pred, consuming as it scans.
  async function next(pred: (m: ServerMessage) => boolean): Promise<ServerMessage> {
    for (;;) {
      while (cursor < inbox.length) {
        const m = inbox[cursor++]!;
        if (pred(m)) return m;
      }
      await new Promise<void>((r) => waiters.push(r));
    }
  }
  const lastRoomState = () =>
    [...inbox].reverse().find((m): m is RoomStateMessage => m.type === "roomState");
  return { ws, inbox, send, open, next, lastRoomState, name };
}

test("two clients matchmake and play a full game to gameOver", async () => {
  transport = await createServer(loadConfig({ PORT: "0", RNG_SEED: "5" }));
  const a = client(transport.port, "Riley");
  const b = client(transport.port, "Sam");
  await Promise.all([a.open, b.open]);

  a.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" });
  b.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Sam" });
  await a.next((m) => m.type === "welcome");
  await b.next((m) => m.type === "welcome");

  a.send({ type: "queueJoin" });
  b.send({ type: "queueJoin" });
  await a.next((m) => m.type === "roomState");
  await b.next((m) => m.type === "roomState");

  // Play rounds until the game ends. Sync each round on the resolved roomState
  // (roundIndex advancing) rather than on actionAccepted, which avoids stale matches.
  const reachedRound = (target: number) => (m: ServerMessage) =>
    (m.type === "roomState" && m.roundIndex >= target) || m.type === "gameOver";

  for (let round = 0; round < 10; round++) {
    for (const c of [a, b]) {
      const v = c.lastRoomState()!;
      const card = v.you.hand.find((k) => k.targets === 1)!;
      c.send({ type: "submitTurn", cardId: card.id, targetTrayIds: [v.you.table[0]!.id] });
    }
    await a.next(reachedRound(round + 1));
    await b.next(reachedRound(round + 1));
  }

  const overA = await a.next((m) => m.type === "gameOver");
  const overB = await b.next((m) => m.type === "gameOver");
  expect(overA.type).toBe("gameOver");
  expect(overB.type).toBe("gameOver");
  a.ws.close();
  b.ws.close();
}, 15000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- e2e`
Expected: FAIL — `../src/index.js` not found.

- [ ] **Step 3: Implement `packages/server/src/index.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { defaultRules } from "./engine/rules/index.js";
import { systemClock, systemTimers } from "./lobby/timers.js";
import { Matchmaker } from "./lobby/matchmaking.js";
import { RoomRegistry } from "./lobby/registry.js";
import { Lobby } from "./lobby/lobby.js";
import { startTransport, type Transport } from "./transport/server.js";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createServer(config: Config = loadConfig()): Promise<Transport> {
  const logger = createLogger(config.logLevel, { app: "eatio" });
  const lobby = new Lobby({
    config,
    rules: defaultRules,
    clock: systemClock,
    timers: systemTimers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(randomCode),
    logger,
    genId: () => randomUUID(),
    genToken: () => randomUUID(),
  });
  return startTransport({ lobby, config, logger });
}

// Run when executed directly (tsx packages/server/src/index.ts).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { app: "eatio" });

  process.on("uncaughtException", (err) => logger.error("uncaughtException", { err: String(err) }));
  process.on("unhandledRejection", (err) => logger.error("unhandledRejection", { err: String(err) }));

  createServer(config).then((transport) => {
    const shutdown = async (signal: string) => {
      logger.info("shutting down", { signal });
      await transport.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  });
}
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npm test -- e2e`
Expected: PASS (a full game completes over real sockets).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Smoke-run the server by hand**

Run: `npm start` (then Ctrl-C). Expected: a `listening` log line at the configured port; clean exit on Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(server): composition root, graceful shutdown, end-to-end game test"
```

---

### Task 24: PROTOCOL.md (self-contained protocol document)

The document required by §0.4. Its only assumed reader is an agent with no access to server source — so it must be complete on its own. This task writes it verbatim; keep it in sync with `messages.ts` (the schemas remain the source of truth).

**Files:**
- Create: `packages/server/PROTOCOL.md`

- [ ] **Step 1: Write `packages/server/PROTOCOL.md`**

````markdown
# eat.io WebSocket Protocol

**Protocol version: 1.** This document is the complete contract between the eat.io
server and any client. The zod schemas in `@eat.io/protocol` are the source of truth; this
prose describes them. If they disagree, the schemas win — but they should not.

## Transport

- A single **WebSocket** connection per client. No REST, no other channel.
- Every frame is a **JSON object** with a `type` field (a discriminated union).
- Both directions are **validated on receipt**. An invalid inbound frame is answered with
  an `error` and otherwise ignored; it never affects other clients or the room.
- Frames are UTF-8 JSON text. Binary frames are not used.

## Handshake and versioning

The client's first message MUST be `hello`, carrying `protocolVersion`. If it does not equal
the server's version, the server replies with `error` `code: "PROTOCOL_MISMATCH"` and does
not create a session. On success the server replies with `welcome`, which carries the
`playerId` and a `sessionToken` (used only for reconnection).

Any non-`hello` message sent before a successful `hello` gets `error` `code: "NO_SESSION"`.

## Two kinds of failure

- **`error`** — the message was malformed, failed schema validation, was unknown, or was
  sent out of order. `code` is a short string; `message` is human-readable. Non-fatal.
- **`actionRejected`** — a well-formed `submitTurn` that was an illegal *move*. `code` is a
  machine-readable `RejectionCode` the UI can render. Non-fatal.

Every `submitTurn` receives exactly one of `actionAccepted` or `actionRejected`.

## Client → Server messages

| `type` | Fields | Sent when |
|---|---|---|
| `hello` | `protocolVersion: number`, `name: string` (1–14 chars), `sessionToken?: string` | First message. Include `sessionToken` to reconnect to an existing seat. |
| `queueJoin` | — | Enter the public matchmaking queue. |
| `queueCancel` | — | Leave the public queue. |
| `roomCreatePrivate` | — | Create a private room; the server replies with a join code. |
| `roomJoinPrivate` | `code: string` | Join a private room by its code. |
| `submitTurn` | `cardId: string`, `targetTrayIds: string[]` | Commit this round's move: play `cardId` against the listed trays on your own table. For a card that takes N targets, send exactly N ids. |
| `roomLeave` | — | Leave the current room and return to the menu. |
| `ping` | — | Liveness check; answered with `pong`. |

`submitTurn` is the only in-game action, and it is **semantic** — it names what you did in
game terms, never UI events (no clicks/drags/selection). Selection and targeting order are
the client's business and resolve to this one committed action.

## Server → Client messages

| `type` | Fields | Sent when |
|---|---|---|
| `welcome` | `playerId: string`, `sessionToken: string` | After a valid `hello` (new session or reconnect). |
| `error` | `code: string`, `message: string` | A malformed/invalid/unknown/out-of-order message. Affects only this client. |
| `queueWaiting` | — | You joined the public queue and are waiting for an opponent. |
| `roomJoinedPrivate` | `code: string` | You created a private room; share this code. |
| `roomState` | *(full view — see below)* | **Any** change to your game: on start, after every submission, after each round resolves, on pause/resume, and on abandon. |
| `actionAccepted` | — | Your `submitTurn` was legal and recorded; awaiting the opponent. |
| `actionRejected` | `code: RejectionCode`, `message: string` | Your `submitTurn` was illegal. |
| `gameOver` | `result: Result` | The game ended (round limit reached). Terminal. |
| `opponentDisconnected` | `graceEndsAt: number` (epoch ms) | Your opponent dropped; the room is paused until they reconnect or the grace window ends. |
| `opponentReconnected` | — | Your opponent returned within the grace window; play resumes. |
| `pong` | — | Reply to `ping`. |

### `roomState` (the per-player view)

Sent to each player with **only what that player may see**. Deltas are never used — every
`roomState` is the complete current view, which makes reconnection trivial.

```
{
  "type": "roomState",
  "phase": "waiting" | "in-progress" | "paused" | "finished" | "abandoned",
  "roundIndex": number,          // 0-based; how many rounds have resolved
  "roundCount": number,          // total rounds in this game
  "deadlineAt": number | null,   // epoch ms your current move is due by; null while paused
  "you": {
    "seat": "a" | "b",
    "name": string,
    "score": number,             // total eaten so far
    "submitted": boolean,        // have you committed this round
    "table": [ { "id": string, "value": number }, ... ],   // front tray first
    "hand": [ { "id": string, "name": string, "action": "add" | "multiply",
               "amount": number, "targets": number }, ... ]
  },
  "opponent": {
    "seat": "a" | "b",
    "name": string,
    "score": number,
    "submitted": boolean,
    "handCount": number,         // COUNT only — never the opponent's cards
    "table": [ { "id": string, "value": number }, ... ]
  }
}
```

**Secrecy:** the opponent's `hand` cards and both players' decks are **absent** from the
payload — not hidden, absent. Render only what you are sent.

**Rendering from data:** card `name`, `action`, `amount`, and `targets` all come from the
server. Do not hardcode card behavior, hand size, or table length — they can change.

### `Result` (inside `gameOver`)

```
{ "kind": "win" | "loss" | "draw", "scores": { "a": number, "b": number } }
```

`kind` is relative to the receiving player. `scores` are absolute per seat. A **draw** is an
ordinary value — render it, do not treat it as a missing winner.

### `RejectionCode` values

`NOT_IN_ROOM`, `NOT_YOUR_TURN`, `ALREADY_SUBMITTED`, `CARD_NOT_HELD`,
`WRONG_TARGET_COUNT`, `BAD_TARGET`.

## Typical sequences

**Matchmake and play a round**

```
C→S hello {protocolVersion:1, name:"Riley"}
S→C welcome {playerId, sessionToken}
C→S queueJoin
S→C queueWaiting                     (until an opponent arrives)
S→C roomState {phase:"in-progress", deadlineAt, you, opponent}
C→S submitTurn {cardId, targetTrayIds}
S→C actionAccepted
S→C roomState (you.submitted:true)
   ... when both have submitted, the round resolves ...
S→C roomState (roundIndex incremented, new deadlineAt)
```

**Disconnect and reconnect**

```
(socket drops)
S→C(opponent) opponentDisconnected {graceEndsAt}     room is now paused
(within grace, dropped client opens a new socket)
C→S hello {protocolVersion:1, name:"Riley", sessionToken:<same token>}
S→C welcome {playerId:<same>, sessionToken:<same>}
S→C(opponent) opponentReconnected
S→C(both) roomState {phase:"in-progress", ...}       full view resent
```

**Turn clock expiry (connected but idle)**

```
(you do not submit before deadlineAt; you are still connected)
   server auto-discards one random card from your hand (no tray effect)
S→C roomState (round resolved)
```
````

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs(server): self-contained PROTOCOL.md"
```

---

### Task 25: README

The README required by §1.8: what it is, stack + why, how to run, layer layout, where rules live, and known limitations.

**Files:**
- Create: `packages/server/README.md`
- Modify: `README.md` (root) — a short pointer to the two packages.

- [ ] **Step 1: Write `packages/server/README.md`**

````markdown
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
- **Lobby / Room** (`src/lobby/`) — the coordinator, matchmaker (public queue + private
  code), room registry with reaping, and the `Room` turn loop (submit → resolve, the 20s
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
````

- [ ] **Step 2: Write the root `README.md`**

````markdown
# eat.io

A two-player game about trays of food advancing down a table and being eaten for points.
An npm-workspaces monorepo:

- **`packages/protocol`** (`@eat.io/protocol`) — the shared, versioned wire contract: zod
  schemas that are the single source of truth for both runtime validation and TypeScript
  types.
- **`packages/server`** (`@eat.io/server`) — the authoritative WebSocket game server. See
  its [README](./packages/server/README.md) and [PROTOCOL.md](./packages/server/PROTOCOL.md).

The React client is a separate project (built later) that depends on `@eat.io/protocol`.

```bash
npm install
npm test          # run all package tests
npm start         # start the server
```

Design docs live in `docs/superpowers/`.
````

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: server README and monorepo root README"
```

---

## Self-Review

Run after implementing all tasks (also serves as a final acceptance checklist):

1. **Spec coverage** — every spec section maps to a task:
   - §2 stack/monorepo → Tasks 1–3; §3 layout → Task 1; §4 layers → Tasks 4–23.
   - §5 protocol → Tasks 2–3, 24; §5.3 view → Task 11; §6 engine → Tasks 4–12.
   - §7.1 transport → Task 22; §7.2 session → Task 16; §7.3 lobby/room → Tasks 17–21;
     §7.4 disconnect/reconnect → Task 18; §7.5 process safety → Tasks 22–23.
   - §8 config → Task 14; §9 logging/errors → Tasks 13, 22, 7; §10 testing → Tasks 12, e2e 23.
   - §11 deliverables → Tasks 24–25; §12 scope + §13 quality → enforced throughout.
2. **Placeholder scan** — no `TBD`/`TODO` remain in source; genuine deferrals are in the
   README known-limitations, not in code.
3. **Type consistency** — the message `type` string literals match between `messages.ts`
   (Task 3) and every `send(...)`/switch site (Tasks 17–22); engine function names match
   their call sites (`resolveRound`, `viewFor`, `isGameOver`, `rankResult`, `resultFor`,
   `setConnected`, `autoMove`, `everyoneSubmitted`, `validateAction`, `applyAction`).
4. **Final gates** — `npm test` all green; `npm run typecheck` clean; `npm start` logs
   `listening` and shuts down cleanly on Ctrl-C.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-eat-io-server.md`.
