# eat.io Tutorial, Clothing, and a Varied Crowd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guided practice game against a server bot and clothing chosen by body part. The cafeteria crowd wears the new clothing and shop items, with an even spread of skin tones.

**Architecture:** The protocol gains the clothing fields, four skin tones, six shop items, `practiceStart`, and `roomState.mode` (version 5). The engine gains an optional opening hand per player and a pure bot move chooser. The lobby starts a practice room with a bot seat that plays through the injected timers, with no deadline and no rewards. The client draws the new clothing, generates the crowd's looks, and runs the tutorial prompts from a pure function over the room view.

**Tech Stack:** TypeScript strict (ESM), zod, better-sqlite3, vitest, React 19 + React Three Fiber, drei.

**Spec:** `docs/superpowers/specs/2026-09-27-eat-io-tutorial-clothing-design.md`

## Global Constraints

- Branch `tutorial-clothing`. `npm test` and `npm run typecheck` from the repo root pass at the end of every task, except where a task says a later task closes a gap.
- `PROTOCOL_VERSION = 5`.
- The engine (`packages/server/src/engine/`) stays pure: no sockets, no timers, no `Date`, no `Math.random`. The bot's move chooser lives in the engine and takes an injected `Rng`.
- No module-level mutable state in the server. The practice bot hangs off its room.
- Per-player logic runs over the players collection, never `playerOne`/`playerTwo`.
- The bot sees only its own `roomState` view, the same payload a human gets.
- The client computes no game state. Tutorial prompts read the view and the local selection.
- Practice rules: 6 rounds, no deadline (`deadlineAt: null`), hand size 5, `TUNING.tableLength`, `STARTING_DECK`. A practice room never calls `onResult`.
- Opening hand for the human, in order: `add3x1`, `mul2x1`, `addAll1`, `servings2x2`, `add1x2`.
- Bot: name "Sam", a fixed free look, moves about 1000 ms after a round starts, half best move (highest front-tray value) and half uniformly random legal move.
- Appearance fields and values: `top` free `tee`, `buttonUp`, `graphicTee`, `hoodie`, shop `catEarHoodie` (60). `bottom` free `pants`, `shorts`, `skirt`. `onePiece` free `none`, `dress`, `overalls`, shop `sparklyDress` (80). `graphic` free `star`, `pizza`, `lightning`, `planet`, shop `rubberDuck` (30), `dinosaur` (40), `taco` (30), `rainbow` (50). Defaults `tee`, `pants`, `none`, `star`.
- Shop item ids: `top.catEarHoodie` "Cat-Ear Hoodie", `onePiece.sparklyDress` "Sparkly Dress", `graphic.rubberDuck` "Rubber Duck Graphic", `graphic.dinosaur` "Dinosaur Graphic", `graphic.taco` "Taco Graphic", `graphic.rainbow` "Rainbow Graphic".
- Skin tones, light to dark: `#f6d7bf`, `#eec19b`, `#e2b087`, `#d9a47a`, `#c68b5e`, `#b87a4f`, `#9f6641`, `#8d5634`, `#5e3a24`, `#3f2618`. All free.
- Combining: a dress (plain or sparkly) replaces top and bottom and uses `shirtColor`. Overalls replace the bottom, sit over the top, and use `pantsColor`. The graphic shows only on a visible `graphicTee`.
- No database migration.
- Headless Chromium through playwright-core scripts only. Never the playwright-chrome MCP tools.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never "plate".
- Full, descriptive variable names. Commits carry no Co-Authored-By, "Generated with", or Claude/Anthropic lines.

## Review Focus

1. A reload or reconnect in the middle of the practice game. Expect the game to resume with the bot, and the prompt to match the current round, not restart at round 1.
2. A logged-in player finishes a practice game. Expect no change to games played, games won, points, or Lunch Money, and no "+N Lunch Money" line.
3. "How to play" pressed while queued or seated (a stale button or a raw message). Expect the server to refuse with an error and nothing else to change.
4. A dress is picked, then the one-piece goes back to none. Expect the earlier top and bottom to show again, because they were stored all along.
5. A saved look with an unowned shop graphic under a hoodie. Expect `appearanceSet` to refuse it with `NOT_OWNED`, and the logout fallback to swap in `star`.

---

### Task 1: Protocol version 5

**Files:** `packages/protocol/src/accounts.ts`, `shop.ts`, `messages.ts`, `version.ts`, `index.ts`, `packages/server/PROTOCOL.md`. Tests in `packages/protocol/test/`.

**Produces:**

```ts
// accounts.ts
export const SKIN_TONES = ["#f6d7bf", "#eec19b", "#e2b087", "#d9a47a", "#c68b5e", "#b87a4f", "#9f6641", "#8d5634", "#5e3a24", "#3f2618"] as const;
export const FREE_TOPS = ["tee", "buttonUp", "graphicTee", "hoodie"] as const;
export const TOPS = [...FREE_TOPS, "catEarHoodie"] as const;
export const BOTTOMS = ["pants", "shorts", "skirt"] as const;
export const FREE_ONE_PIECES = ["none", "dress", "overalls"] as const;
export const ONE_PIECES = [...FREE_ONE_PIECES, "sparklyDress"] as const;
export const FREE_GRAPHICS = ["star", "pizza", "lightning", "planet"] as const;
export const GRAPHICS = [...FREE_GRAPHICS, "rubberDuck", "dinosaur", "taco", "rainbow"] as const;
// AppearanceSchema gains, each with .default() so older looks parse:
top: z.enum(TOPS).default("tee"),
bottom: z.enum(BOTTOMS).default("pants"),
onePiece: z.enum(ONE_PIECES).default("none"),
graphic: z.enum(GRAPHICS).default("star"),
export type Top, Bottom, OnePiece, Graphic; // z.infer / (typeof X)[number]

// shop.ts
ShopItemKindSchema gains "top", "onePiece", "graphic";
SHOP_ITEM_KIND_FIELDS gains { top: "top", onePiece: "onePiece", graphic: "graphic" };
SHOP_ITEMS gains, in this order at the end:
  shopItem("top.catEarHoodie", "Cat-Ear Hoodie", "top", "catEarHoodie", 60),
  shopItem("onePiece.sparklyDress", "Sparkly Dress", "onePiece", "sparklyDress", 80),
  shopItem("graphic.rubberDuck", "Rubber Duck Graphic", "graphic", "rubberDuck", 30),
  shopItem("graphic.dinosaur", "Dinosaur Graphic", "graphic", "dinosaur", 40),
  shopItem("graphic.taco", "Taco Graphic", "graphic", "taco", 30),
  shopItem("graphic.rainbow", "Rainbow Graphic", "graphic", "rainbow", 50),

// messages.ts
export const RoomModeSchema = z.enum(["match", "practice"]);
RoomStateSchema gains mode: RoomModeSchema;
export const PracticeStartSchema = z.object({ type: z.literal("practiceStart") }); // in the client message union

// version.ts
PROTOCOL_VERSION = 5; // with a v5 comment listing every change above
```

- [ ] Failing tests: a six-field look (no face, no clothing) parses with every default. A nine-field look (face, no clothing) parses with the clothing defaults. Each new enum rejects an unknown value. All 10 skin tones parse. `lockedItemsIn` finds `top.catEarHoodie`, `onePiece.sparklyDress`, and each shop graphic when unowned, and none when owned. Every shop item unlocks a value that is in its field's list and not in its free list. `practiceStart` parses. `roomState` without `mode` fails.
- [ ] Implement. Document every change in `PROTOCOL.md`.
- [ ] `npx vitest run packages/protocol` and `npx tsc -b packages/protocol` pass. The server fails typecheck at `shop/looks.ts` until Task 3, and the client fails until Task 4. List the errors in the report.
- [ ] Commit: `feat(protocol): v5: clothing, more skin tones, practice games`.

---

### Task 2: Engine: opening hands and the bot's move

**Files:** `packages/server/src/engine/deal.ts`, new `packages/server/src/engine/bot.ts`. Tests: `packages/server/test/engine.openingHand.test.ts` (new), `packages/server/test/bot.test.ts` (new), `packages/server/test/practiceGame.test.ts` (new).

**Interfaces:**
- Consumes: `CARD_CATALOG`, `STARTING_DECK`, `makeRules`, `createGame`, `applyAction`, `validateAction`, `everyoneSubmitted`, `resolveRound`, `isGameOver`, `viewFor`, and `Rng`, `nextInt` from `util/rng.ts`.
- Produces:

```ts
// deal.ts — CreateGameOptions gains:
openingHands?: Partial<Record<PlayerId, readonly string[]>>; // catalog card ids, in hand order
// For a player with an opening hand: each id takes one matching copy out of that player's
// built deck (the first copy found). If the deck has none, stamp one from CARD_CATALOG.
// The hand is exactly those cards in that order, and the deck is what is left. Unknown ids
// throw. An opening hand longer than rules.config.handSize throws.

// bot.ts
export interface BotMove { cardInstanceId: string; targetTrayIds: string[] }
/** Every legal move for the view's own hand: one per card. A card with targets aims at
 *  the front trays (table[0..targets-1]). A card with no targets aims at none. Cards that
 *  need more trays than the table has are left out. */
export function legalBotMoves(view: { you: { table: { id: string; value: number }[]; hand: CardView[] } }): BotMove[];
/** Half the time (nextInt(rng, 2) === 0) the move whose front tray ends highest
 *  (add: value + amount; multiply: value * amount; addAll: value + amount;
 *  extraServings: value), else a uniformly random legal move. Ties go to the first
 *  move in hand order. Returns null when there is no legal move. */
export function chooseBotMove(view: Parameters<typeof legalBotMoves>[0], rng: Rng): [BotMove | null, Rng];
```

- [ ] Failing tests:
  - An opening hand deals exactly the five given cards in order. The deck shrinks by one copy of each. With `servings2x2` at 0 copies in the composition, the card is still dealt. The other player's hand is random and unchanged by the option. An unknown id throws.
  - `legalBotMoves` gives one move per card, with correct targets for 0, 1, and 2-target cards.
  - With a fixed seed, `chooseBotMove` returns the same move every time. Over 200 seeds, both the best move and at least one other move are chosen, and every chosen move passes `validateAction` in a real game state.
  - A full practice game with no server: rules `makeRules({ tableLength: TUNING.tableLength, handSize: 5, deck: STARTING_DECK })`, 6 rounds, the human with the opening hand always plays its first card at the front trays, the bot plays `chooseBotMove` on `viewFor(state, botId, null)`. The game reaches `isGameOver` after exactly 6 resolved rounds with no thrown error.
- [ ] Implement. `npm test` and `npx tsc -b packages/server` pass except the Task 1 `looks.ts` errors.
- [ ] Commit: `feat(engine): scripted opening hands and a gentle bot move chooser`.

---

### Task 3: Server: practice rooms and the new looks

**Files:** `packages/server/src/lobby/room.ts`, `lobby/lobby.ts`, new `lobby/practiceBot.ts`, `shop/looks.ts`. Tests: `packages/server/test/practice.lobby.test.ts` (new), `practiceBot.test.ts` (new), and the existing look and shop tests.

**Interfaces:**
- Consumes: Task 1 schemas, Task 2 `openingHands` and `chooseBotMove`.
- Produces:
  - `RoomDeps.moveDeadlineMs: number | null`. With `null`, `armDeadline` sets `deadlineAt = null` and schedules nothing. `RoomDeps.mode: RoomMode`, sent on every `roomState`. `RoomDeps.openingHands?` passed to `createGame`.
  - `class PracticeBot { constructor(deps: { playerId: PlayerId; timers: Timers; seed: number; submit: (move: BotMove) => void; delayMs: number }); receive(message: ServerMessage): void; stop(): void }`. On a `roomState` with `phase === "in-progress"` and `you.submitted === false`, if no move is scheduled, it schedules one after `delayMs` (1000). When the timer fires, it chooses from the latest view and submits. `stop()` cancels a pending timer. It ignores every other message.
  - `looks.ts`: `FREE_FALLBACK_BY_KIND` gains `top: FREE_TOPS[0]`, `onePiece: FREE_ONE_PIECES[0]`, `graphic: FREE_GRAPHICS[0]`.

**Behavior:**
- `practiceStart` from a player who is seated or waiting in matchmaking gets `error` with code `ALREADY_BUSY` and message "Leave your game or the queue first." Waiting includes the public queue and an unclaimed private room. Add `ALREADY_BUSY` to the error codes in the protocol and `PROTOCOL.md` if no fitting code exists.
- Otherwise start a practice room: the human in seat `a`, the bot in seat `b`, with the Global Constraints rules and `openingHands: { [humanId]: [the five ids] }`. The bot's player id is `bot:<roomId>`, which no connection can have. The bot's name is "Sam" and its look is a fixed free `Appearance` constant in `practiceBot.ts`. The room's `send` routes the bot's id to `bot.receive` and every other id to the normal send. `onResult` is a no-op. `onFinished` reaps the room and calls `bot.stop()`. The seed is `config.seed ?? Math.floor(Math.random() * 0x7fffffff)` (lobby code, not engine code). The bot's seed is derived from the room seed.
- `roomLeave` ends a practice room at once (the existing abandon path). A disconnect pauses it with the normal grace. The bot never disconnects.
- A practice room is not in `roomAccounts`, so no stats are recorded.

- [ ] Failing tests:
  - `practiceStart` gives a `roomState` with `mode: "practice"`, `roundCount: 6`, `deadlineAt: null`, a 5-card hand in the opening order, and the opponent named "Sam" with its look.
  - After the human submits, advancing the fake timers by 1000 ms makes the bot submit and the round resolve. Six rounds reach `gameOver`.
  - A logged-in player's stats and Lunch Money are unchanged after a finished practice game.
  - `practiceStart` while queued, while waiting in a private room, and while seated is refused with `ALREADY_BUSY`, and nothing else changes.
  - `roomLeave` ends the room, and the bot's pending timer never fires (no submit after the room is gone).
  - A disconnect, then a reconnect inside the grace, resumes the game, and the bot plays the next round. A disconnect past the grace ends the room with no result.
  - A normal match `roomState` has `mode: "match"`.
  - `appearanceSet` refuses each new shop value when unowned with `NOT_OWNED`. The logout fallback turns `catEarHoodie` into `tee`, `sparklyDress` into `none`, and a shop graphic into `star`.
- [ ] Implement. `npm test` and `npx tsc -b packages/server` pass. The client still fails typecheck until Task 4.
- [ ] Commit: `feat(server): practice games against a bot, with no deadline and no rewards`.

---

### Task 4: Client: the clothing on the kid and in Customize

**Files:** `packages/client-3d/src/appearance/appearance.ts`, `scene/characters/Kid.tsx`, new `scene/characters/KidClothing.tsx`, new `scene/characters/ShirtGraphic.tsx`, `ui/CustomizePanel.tsx`, `ui/optionRows.ts` if it needs the new fields. Tests in `packages/client-3d/test/` for any pure helpers.

**Interfaces:**
- Consumes: Task 1 lists and types.
- Produces:
  - `DEFAULT_APPEARANCE` gains `top: "tee"`, `bottom: "pants"`, `onePiece: "none"`, `graphic: "star"`.
  - `randomAppearance(seed)` stays free-only and draws the four new fields after all the existing fields, from the free lists. `FREE_FALLBACK_BY_KIND` on the client gains the same three entries as the server.
  - `export function visibleClothing(look: Appearance): { top: Top | null; bottom: Bottom | null; onePiece: OnePiece; graphic: Graphic | null }`, a pure helper. A dress or sparkly dress gives `top: null` and `bottom: null`. Overalls give `bottom: null` and keep the top. `graphic` is non-null only for a visible `graphicTee`.

**Behavior:**
- `KidClothing` draws from `visibleClothing` with the existing toon materials and geometry helpers. Tee: today's torso. Button-up: collar and a button line. Graphic T: tee plus `ShirtGraphic` on the chest. Hoodie: a hood behind the head, a front pocket, and two strings. Cat-ear hoodie: the hoodie plus two ears on the hood. Pants: today's legs. Shorts: short pant legs with skin-toned lower legs. Skirt: a short flared skirt with skin-toned legs. Dress: a flared dress from chest to knee in `shirtColor`, with skin-toned lower legs and the arms in `shirtColor` sleeves. Sparkly dress: the dress plus small bright specks. Overalls: legs in `pantsColor`, a bib and two straps over the top.
- `ShirtGraphic` draws each graphic with a few simple meshes, readable at the Customize camera: star, pizza slice, lightning bolt, planet with a ring, rubber duck, dinosaur, taco, rainbow.
- Low detail uses fewer segments and skips the sparkle specks and the hoodie strings.
- Customize rows, in order: Skin, Hair, Hair color, Eyes, Eye color, Mouth, Top, Graphic (only while the top is `graphicTee`), Top color (was "Shirt"), Bottom, Bottom color (was "Pants"), One-piece, Extra. While a dress is picked, Top and Bottom are disabled with the note "A dress covers the top and bottom." Shop values show as locked rows, as today.

- [ ] Failing tests: `visibleClothing` for a tee, a graphic T, a dress over a graphic T, overalls over a hoodie, and a sparkly dress. `randomAppearance` returns only free values over 500 seeds, and the looks of the existing fields for a given seed are unchanged from before this task. `DEFAULT_APPEARANCE` parses with `AppearanceSchema`.
- [ ] Implement. `npm test`, `npm run typecheck`, and `npm run build --workspaces` pass.
- [ ] Browser check (headless Chromium through a playwright-core script in the scratchpad, never the playwright-chrome MCP): a screenshot sheet of the Customize kid in each top, each bottom, each one-piece, and each graphic, at High and Low. Put the paths in the report.
- [ ] Commit: `feat(client): tops, bottoms, dresses, overalls, and shirt graphics`.

---

### Task 5: Client: the varied crowd

**Files:** `packages/client-3d/src/appearance/appearance.ts` (or a new `appearance/crowdAppearance.ts`), `scene/cafeteria/Crowd.tsx`, `DiningArea.tsx`, `ServingLine.tsx`, `Decor.tsx`, `layout.ts` as needed. Test: `packages/client-3d/test/crowdAppearance.test.ts` (new).

**Interfaces:**
- Produces: `export function crowdAppearance(crowdIndex: number): Appearance`. It is pure and deterministic.
  - `skinTone = SKIN_TONES[toneOrder[crowdIndex % 10]]`, where `toneOrder` is a fixed permutation of 0–9, so any 10 consecutive indices use every tone once.
  - The other fields come from `createRandom(hash of crowdIndex)` over the full lists, free and shop.
  - Three in four kids (decided by the index, so exactly 75 of every 100 consecutive indices) wear at least one shop value. For those kids, pick a random shop item and set its field to its value, then maybe a second (chance 0.35).
  - Tops, bottoms, and one-pieces are spread so that every value appears within any 40 consecutive indices.
- Every crowd kid in the scene gets a distinct `crowdIndex` from one shared index space. This covers the walkers, the serving line, the seated diners, and any decor kid. Assign the indices in `layout.ts` or in one counter module. No two crowd kids share an index. `randomAppearance` stays for "Surprise me" and for `appearanceFromName`.

- [ ] Failing tests: any 10 consecutive indices use all 10 tones. Across indices 0 to N−1 for the real crowd size N, tone counts differ by at most 1. Exactly 75 of indices 0–99 wear at least one shop value. Every `TOPS`, `BOTTOMS`, and `ONE_PIECES` value appears within indices 0–39. The same index always gives the same look. Every look parses with `AppearanceSchema`.
- [ ] Implement. `npm test`, `npm run typecheck`, and the build pass.
- [ ] Browser check (headless only): a screenshot of the menu scene at High and at Low. Note in the report the crowd size and the frame rate if a quick measure is easy.
- [ ] Commit: `feat(client): a crowd with every skin tone, the new clothing, and shop items`.

---

### Task 6: Client: the tutorial

**Files:** new `packages/client-3d/src/tutorial/tutorialSteps.ts`, new `tutorial/tutorialHint.ts`, new `ui/TutorialCallout.tsx`, `ui/MenuPanel.tsx`, `ui/GameHud.tsx`, `ui/HandBar.tsx`, `ui/GameOverPanel.tsx`, `state/gameReducer.ts`, `state/GameProvider.tsx`, and the scene files that draw the highlights (`scene/game/GameTable.tsx`, `Tray3D.tsx`, `ServingsMarker.tsx`). Tests: `packages/client-3d/test/tutorialSteps.test.ts` (new), `tutorialHint.test.ts` (new), reducer tests.

**Interfaces:**
- Consumes: Task 1 `practiceStart` and `roomState.mode`, Task 3 server behavior.
- Produces:

```ts
// tutorial/tutorialSteps.ts
export type TutorialAnchor = "table" | "trays" | "eater" | "hand" | "card" | "tray-target" | "end-turn" | "servings-marker" | null;
export interface TutorialPrompt { id: string; text: string; anchor: TutorialAnchor; suggestedCardId: string | null; advance: "next" | "select" | "target" | "submit" | "resolve" }
export interface TutorialProgress { roundIndex: number; stepIndex: number } // held in client state, reset when the round changes
/** The prompt to show, or null for none. Pure: reads the room view, the local selection,
 *  and the progress, never game rules. */
export function tutorialPrompt(view: RoomStateView, selection: SelectionState, progress: TutorialProgress): TutorialPrompt | null;
/** The progress after an event: "next" pressed, a card selected, targets chosen, the turn submitted, or a new roomState. */
export function advanceTutorial(progress: TutorialProgress, event: TutorialEvent, prompt: TutorialPrompt | null, view: RoomStateView): TutorialProgress;

// tutorial/tutorialHint.ts
export const TUTORIAL_HINT_KEY = "eatio.tutorialHintSeen";
export function tutorialHintSeen(storage: Pick<Storage, "getItem"> | null): boolean; // false when storage throws or is null
export function markTutorialHintSeen(storage: Pick<Storage, "setItem"> | null): void; // swallows errors
```

**Behavior:**
- The prompt text and order are exactly spec §5.2. The suggested card per round: round 1 `add3x1`, round 2 `mul2x1`, round 3 `addAll1`, round 4 `servings2x2`. Rounds 1 and 2 have the target step. Rounds 3 and 4 skip it because those cards need no tray. If the suggested card is not in the hand, the text is "Play any card" and `suggestedCardId` is null. Playing a different card still advances.
- On each new round, progress is derived again from the view's `roundIndex`. After a reload or reconnect, the tutorial resumes at that round's first prompt, not at round 1.
- Menu: a "How to play" button sends `practiceStart`. While the hint is unseen, a small hint beside it reads "New here? Learn to play in a minute." with a close button. Pressing either marks it seen.
- In a practice room: the callout shows the prompt, with a Next button for `advance: "next"` steps. The suggested card in the hand has a highlight ring. A 3D highlight marks the trays, the eater, or the servings marker for those anchors. The End turn button pulses for the `end-turn` anchor. A "Skip" button is always visible and sends `roomLeave`, then returns to the menu. No turn clock shows while `deadlineAt` is null.
- Game over in a practice room: "You are ready!" with the score. The buttons are "Find a game" (sends `queueJoin`) and "Back to menu". No Lunch Money line.
- The reducer keeps `mode` from `roomState`.

- [ ] Failing tests:
  - `tutorialPrompt` and `advanceTutorial` step through every prompt of rounds 1–6 in order for the scripted hand.
  - Picking a different card in round 2 advances like the suggested card, and round 3 still suggests `addAll1`.
  - A missing suggested card gives "Play any card".
  - A view at round 3 with fresh progress gives round 3's first prompt.
  - Round 6 gives null.
  - `tutorialHintSeen` is false for null storage and for storage whose `getItem` throws. `markTutorialHintSeen` does not throw when `setItem` throws.
  - The reducer stores `mode`, and a practice game over hides the Lunch Money line (through the existing `lunchMoneyEarnedIn` or a mode check).
- [ ] Implement. `npm test`, `npm run typecheck`, and the build pass.
- [ ] Browser check (headless only, a local server with `DATABASE_PATH=:memory:` on port 8765 and the Vite dev server): a guest sees the hint, presses How to play, follows every prompt to "You are ready!", and a screenshot is taken at each prompt. A second run presses Skip in round 2 and lands on the menu. A third run reloads the page in round 3 and sees the round 3 prompt. Report any page errors.
- [ ] Commit: `feat(client): a guided practice game with prompts, a first-visit hint, and Skip`.

---

### Task 7: Docs

**Files:** `packages/server/README.md`, `packages/client-3d/README.md`, root `README.md` if it lists features, `packages/server/PROTOCOL.md` (make sure that Tasks 1 and 3 covered it), and `scripts/play-demo.mjs` (`PROTOCOL_VERSION` to 5).

- [ ] Describe practice games (rules, the bot, no rewards, `practiceStart`, `mode`), the tutorial and its hint, the clothing fields and how they combine, the new skin tones, the six new shop items, and the crowd. Match each README's tone.
- [ ] Run `node scripts/play-demo.mjs` against a local server on port 8765 and make sure that it plays to the end.
- [ ] `npm test` passes.
- [ ] Commit: `docs: practice games, the tutorial, clothing, and the crowd`.
