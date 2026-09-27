# eat.io New Cards, Admin Settings, and Creator Deck Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new cards with the extra-servings mechanic, database-backed game settings with an admin panel, and a creator deck editor for the default deck.

**Architecture:** The protocol gains the new card shape, the board's extra-servings list, the limits, and the admin messages. The engine gains table effects and builds decks from a composition passed in as data. A new store keeps the settings and the deck in the existing SQLite file (migration 2). The lobby reads both when a room starts and builds that room's rules. The client adds the card glyphs, a servings marker on the table, and two panels.

**Tech Stack:** TypeScript strict (ESM), zod, better-sqlite3, vitest, React 19 + React Three Fiber.

**Spec:** `docs/superpowers/specs/2026-09-27-eat-io-cards-settings-deck-design.md`

## Global Constraints

- Branch `cards-admin-deck`. `npm test` and `npm run typecheck` from the repo root must pass at the end of every task, except where a task says a later task closes a gap.
- The engine (`packages/server/src/engine/`) never imports the database or the stores. It receives settings and the deck as plain data.
- A new card is a catalog entry. A new action is one entry in a dispatch table. No new branches in the turn loop.
- No module-level mutable state in the server. Time comes from the injected `Clock`.
- The client computes no game state.
- `PROTOCOL_VERSION = 4`.
- Limits: round count 1–30, turn clock 5–120 seconds, hand size 3–8, copies per card 0–40, deck total 10–100, all whole numbers.
- Permissions: `["admin.open", "settings.edit", "deck.edit"]`. Admin gets `admin.open` and `settings.edit`. Creator gets all.
- New cards: `addAll1` "Add One Food To Every Tray" (`addAll`, amount 1, targets 0). `servings2x2` "Extra Servings" (`extraServings`, amount 2, targets 0, turns 2).
- Starting deck (40): add1x1 5, add1x2 7, add3x1 7, mul2x1 7, mul2x2 6, mul3x1 6, addAll1 1, servings2x2 1.
- Extra servings: a card played this round boosts the tray that arrives at the end of this round first. Overlapping cards add up.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never "plate."
- Full, descriptive variable names. Commits carry no Co-Authored-By, "Generated with", or Claude/Anthropic lines.

## Review Focus

1. A room in progress when the Creator saves a new deck. Expect it to keep drawing from its original composition, including when its deck runs out and is rebuilt.
2. A servings card played on the last round. Expect no error and no effect beyond the game's end.
3. An Admin tries `deckSave`. Expect `FORBIDDEN` and no change.
4. A deck save containing an unknown card id or a total of 9. Expect `INVALID_DECK` and no change.
5. The hand size changed to 8 while the deck total is 10. Expect the next game to deal 8 and rebuild the deck when it runs out.

---

### Task 1: Protocol version 4

**Files:** `packages/protocol/src/enums.ts`, `messages.ts`, `accounts.ts`, `version.ts`, a new `packages/protocol/src/gameConfig.ts`, `index.ts`, `packages/server/PROTOCOL.md`. Tests in `packages/protocol/test/`.

**Produces:**

```ts
// enums.ts
CardActionSchema = z.enum(["add", "multiply", "addAll", "extraServings"]);

// messages.ts — CardViewSchema
targets: z.number().int().nonnegative(),
turns: z.number().int().positive().optional(),
// YouViewSchema and OpponentViewSchema gain:
extraServings: z.array(z.number().int().positive()),

// accounts.ts
PERMISSIONS = ["admin.open", "settings.edit", "deck.edit"] as const;
ROLE_PERMISSIONS = { player: [], admin: ["admin.open", "settings.edit"], creator: PERMISSIONS };

// gameConfig.ts
export const SETTINGS_LIMITS = {
  roundCount: { min: 1, max: 30 },
  turnSeconds: { min: 5, max: 120 },
  handSize: { min: 3, max: 8 },
} as const;
export const DECK_LIMITS = { copiesPerCard: { min: 0, max: 40 }, total: { min: 10, max: 100 } } as const;
export const GameSettingsSchema = z.object({ roundCount: z.number().int(), turnSeconds: z.number().int(), handSize: z.number().int() });
export type GameSettings = z.infer<typeof GameSettingsSchema>;
export const DeckEntrySchema = z.object({ cardId: z.string().max(64), copies: z.number().int() });
export type DeckEntry = z.infer<typeof DeckEntrySchema>;
/** null when valid, else a message naming the broken limit. */
export function settingsProblem(settings: GameSettings): string | null;
/** null when valid, else a message. knownCardIds: the catalog ids. */
export function deckProblem(entries: DeckEntry[], knownCardIds: readonly string[]): string | null;
export function deckTotal(entries: DeckEntry[]): number;
export const AdminErrorCodeSchema = z.enum(["FORBIDDEN", "INVALID_SETTINGS", "INVALID_DECK"]);
```

Client messages: `settingsRequest {}`, `settingsSave { roundCount, turnSeconds, handSize }` (loose `z.number()`, so the server answers with `INVALID_SETTINGS` rather than `BAD_MESSAGE`), `deckRequest {}`, `deckSave { cards: z.array(DeckEntrySchema).max(200) }`.

Server messages: `settings { settings: GameSettingsSchema, updatedAt: number | null, updatedBy: string | null }`. `deck { cards: z.array(DeckCardSchema), total: number, updatedAt, updatedBy }`, where `DeckCardSchema` is the card view fields without `instanceId` (`id, name, action, amount, targets, turns?`) plus `copies`. `adminError { code: AdminErrorCodeSchema, message }`.

- [ ] Failing tests: `settingsProblem` at each edge (1 and 30 ok, 0 and 31 refused, a fraction refused. Same for the other two). `deckProblem` (valid 40-card deck ok. Total 9 and 101 refused. Copies 41 and −1 refused. An unknown id refused. A duplicate id refused). `deckTotal`. Every new message parses. `CardView` with `targets: 0` parses. `roomState` without `extraServings` fails. `permissionsFor("admin")` lacks `deck.edit`, and Creator has all three.
- [ ] Implement. Bump `PROTOCOL_VERSION` to 4 with a v4 comment. Document every change in `PROTOCOL.md`.
- [ ] `npx vitest run packages/protocol` and `npx tsc -b packages/protocol` pass. The server and client are expected to fail typecheck until Tasks 2 and 5. List the errors in the report.
- [ ] Commit: `feat(protocol): v4: table-effect cards, extra servings on the board, game settings and deck messages`.

---

### Task 2: Engine: table effects, extra servings, decks from a composition

**Files:** `packages/server/src/engine/state.ts`, `engine.ts`, `deal.ts`, `rules/index.ts`, `rules/content.ts`. Tests: `packages/server/test/engine.cards.test.ts` (new), `rules.test.ts`, `fullGame.test.ts`, `viewFor.test.ts`.

**Produces:**
- `CardDefinition` gains `turns?: number`. `PlayerState` gains `extraServings: number[]`.
- `content.ts`: the two new catalog entries (values in Global Constraints). `STARTING_DECK: readonly DeckEntry[]` with the starting deck.
- `RulesConfig` gains `deck: readonly DeckEntry[]`. `makeRules({ ..., deck })` defaults `deck` to `STARTING_DECK`. `buildDeck` builds exactly the composition's copies (catalog cards absent from the composition count as 0, composition entries not in the catalog are ignored), then shuffles.
- Rules gain `applyTableEffect(player: { table: Tray[]. ExtraServings: number[] }, card): { table: Tray[]. ExtraServings: number[] }`, dispatched from a `TABLE_EFFECTS` record: `addAll` adds `amount` to every tray. `extraServings` adds `amount` to each of the next `turns` list entries, extending with zeros. `applyEffect` keeps the per-tray actions. The engine calls the table effect for `targets === 0` cards and the tray effect for chosen trays.
- `resolveRound`: after the eaten tray, the fresh tray's value is `freshTrayValue + (extraServings[0] ?? 0)`, and the first entry is removed.
- `viewFor` includes `extraServings` for both players.
- `createGame` starts every player with `extraServings: []`.

- [ ] Failing tests: `addAll` adds 1 to all five own trays and none of the opponent's. Servings played in round r boost the tray arriving at the end of round r and r+1, then stop. Two servings cards give [4, 2] per the spec's example. A discarded (auto-move) servings card changes nothing. A 0-target submit with a non-empty `targetTrayIds` is `WRONG_TARGET_COUNT`. `buildDeck` with the starting deck gives exactly 5, 7, 7, 7, 6, 6, 1, 1. A composition missing a card gives 0 of it. A full game that forces every card type to be played at least once plays to the end.
- [ ] Implement. Update existing tests and fixtures for the new state field only.
- [ ] Server tests pass. `npx tsc -b packages/server` passes (the lobby keeps using `deps.rules` until Task 4).
- [ ] Commit: `feat(engine): add-to-every-tray and extra servings cards, and decks built from a composition`.

---

### Task 3: Settings and deck store

**Files:** `packages/server/src/accounts/database.ts` (migration 2), new `packages/server/src/gameConfig/gameConfigStore.ts`. Test: `packages/server/test/gameConfigStore.test.ts`.

**Produces:**
- Migration 2 (append to `MIGRATIONS`): tables `game_settings` (id INTEGER PRIMARY KEY CHECK (id = 1), round_count, turn_seconds, hand_size INTEGER NOT NULL, updated_at INTEGER, updated_by INTEGER REFERENCES accounts(id)), `default_deck` (card_id TEXT PRIMARY KEY, copies INTEGER NOT NULL CHECK (copies BETWEEN 0 AND 40)), `default_deck_meta` (id INTEGER PRIMARY KEY CHECK (id = 1), updated_at INTEGER, updated_by INTEGER REFERENCES accounts(id)).
- `class GameConfigStore { constructor(database, clock). EnsureDefaults(settings: GameSettings, deck: readonly DeckEntry[]): void. GetSettings(): { settings: GameSettings. UpdatedAt: number | null. UpdatedBy: string | null }. SaveSettings(settings: GameSettings, accountId: number): void. GetDeck(): { entries: DeckEntry[]. UpdatedAt: number | null. UpdatedBy: string | null }. SaveDeck(entries: DeckEntry[], accountId: number): void }`. `ensureDefaults` inserts only when the rows are missing. `saveDeck` replaces the whole table in one transaction. `updatedBy` is the account's username (a join), null when never saved or the account is gone.
- The store does not validate limits (the lobby does, with the protocol helpers), but the SQL CHECK constraints stay as a backstop.

- [ ] Failing tests: a version 1 database with an account upgrades to version 2 and the account is intact. `ensureDefaults` fills empty tables and never overwrites saved values. Settings round trip with `updatedAt` from the clock and `updatedBy` username. Deck round trip. `saveDeck` replaces removed cards. The starting deck totals 40.
- [ ] Implement. `npm test`, `npx tsc -b packages/server` pass.
- [ ] Commit: `feat(server): game settings and default deck in the database (migration 2)`.

---

### Task 4: Lobby: admin messages and per-room rules

**Files:** `packages/server/src/lobby/lobby.ts`, `lobby/room.ts` (if needed), `src/index.ts`. Test: `packages/server/test/gameConfig.lobby.test.ts` (new). Update tests that build a `Lobby`.

**Behavior:**
- `LobbyDeps` gains `gameConfig: GameConfigStore`. `index.ts` builds it after opening the database and calls `ensureDefaults` with `{ roundCount: config.roundCount, turnSeconds: Math.round(config.moveDeadlineMs / 1000), handSize: config.handSize }` and `STARTING_DECK`.
- `startRoom` reads `getSettings()` and `getDeck()` and builds `makeRules({ tableLength: config.tableLength, handSize, deck })` for that room, with `roundCount` and `moveDeadlineMs = turnSeconds * 1000`.
- `settingsRequest` / `settingsSave` need `settings.edit`. `deckRequest` / `deckSave` need `deck.edit`. A guest or a session without the permission gets `adminError FORBIDDEN`. Invalid values get `INVALID_SETTINGS` / `INVALID_DECK` with the helper's message. A save answers with the fresh `settings` / `deck`.
- The `deck` reply lists every catalog card in catalog order with its copies (0 when absent) and the total.
- Saves are allowed while queued or seated.

- [ ] Failing tests, one each: a guest and a Player are refused all four messages. An Admin can save settings but `deckSave` is `FORBIDDEN`. The Creator saves both. Out-of-range settings and an invalid deck are refused and nothing changes. A save changes the next room's round count, deadline, hand size, and deck composition. A room already running keeps its values (including a deck rebuilt mid-game). `updatedBy` is the saver's username.
- [ ] Implement. `npm test`, `npx tsc -b packages/server` pass.
- [ ] Commit: `feat(server): admin settings and creator deck messages. Each room gets its own rules`.

---

### Task 5: Client: new cards and extra servings on the table

**Files:** `packages/client-3d/src/ui/HandBar.tsx`, `src/state/selection.ts` (only if needed), `src/scene/game/GameTable.tsx`, a new `src/scene/game/ServingsMarker.tsx`, `src/scene/game/Tray3D.tsx`, styles. Reducer and fixtures for the new board field. Tests in `packages/client-3d/test/`.

**Behavior:**
- A pure `cardGlyph(card): string` (tested): `add` → `+N`, `multiply` → `×N`, `addAll` → `+N all`, `extraServings` → `+N ×T`.
- The tray line reads "no trays" for `targets: 0`. Choosing such a card makes End turn ready at once (test via `isSubmittable`).
- The servings marker: an HTML label at the foot of each player's row of trays (the end away from the eater) listing the upcoming bonuses, for example "+2, +2", hidden when the list is empty. Colored by seat.
- A tray that arrives while a bonus is pending shows a short highlight as it slides on. Use the difference between the new tray's arrival and the previous board's list, computed in the view from consecutive board states. The view never recomputes a value.
- The client typecheck passes again.

- [ ] Tests for `cardGlyph` and 0-target selection. Implement. `npm test`, `npm run typecheck`, client build pass.
- [ ] Commit: `feat(client): the new cards and an extra-servings marker on the table`.

---

### Task 6: Client: admin panel and creator deck editor

**Files:** `src/state/LocalState.tsx`, `src/state/gameState.ts`, `src/state/gameReducer.ts`, `src/state/GameProvider.tsx`, `src/ui/TopBar.tsx`, new `src/ui/AdminPanel.tsx` and `src/ui/CreatorPanel.tsx`, `src/App.tsx`, `src/scene/Stage.tsx`, `src/scene/cameraShots.ts`, styles. Tests: reducer, and a pure deck-editor helper.

**Behavior:**
- `LocalState` replaces `customizing` and `profileOpen` with one `openPanel: "customize" | "profile" | "admin" | "creator" | null`, keeping the existing behavior (Done on customize sends the look. Entering a room closes every panel). Keep `showingKid` true for customize and profile only.
- Reducer: `settings`, `deck`, and `adminError` messages stored in `AppState` (`adminSettings`, `adminDeck`, `adminError` with a `seq`, and an `adminNotice` after a successful save). `GameApi` gains `requestSettings()`, `saveSettings(settings)`, `requestDeck()`, `saveDeck(entries)`.
- Top bar: "Admin" when the profile has `settings.edit`. "Creator" when it has `deck.edit`. Both hidden during a game.
- Admin panel per spec §9. Number fields clamp nothing silently: they show the range and disable Save while any value is outside it (using `settingsProblem`).
- Creator panel per spec §9: rows with glyph, name, targets, −/+ and a number field, a live total from `deckTotal`, Save disabled while `deckProblem` reports a problem, and the problem shown.
- Opening a panel requests its data. Camera: menu shot for admin and creator.

- [ ] Tests for the reducer cases and the deck-editor helper. Implement. `npm test`, `npm run typecheck`, client build pass.
- [ ] Commit: `feat(client): admin settings panel and creator deck editor`.

---

### Task 7: Docs

**Files:** `packages/server/README.md` (settings and deck now live in the database. Env values are only the first-run defaults), `packages/client-3d/README.md` (the panels, the new cards), root `README.md` if it lists cards.

- [ ] Update. `npm test` passes.
- [ ] Commit: `docs: game settings, the deck editor, and the new cards`.
