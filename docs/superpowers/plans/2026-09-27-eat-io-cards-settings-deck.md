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

---

## Added 2026-09-27: Lunch Money, the shop, and face customization (spec §13)

Execution order: Tasks 1–6, then 8–11, then Task 7 (docs) last, covering everything.

Additional Global Constraints:
- Lunch Money: +score per finished game for logged-in players, in the same transaction as the stats. Migration 3 backfills `lunch_money = points_scored`.
- Shop items and default prices exactly as in spec §13.2 and §13.3. Price limits 1–1000. Permission `shop.edit` (Creator only; Creator already gets every permission).
- Everything free today stays free. Guests cannot own or wear shop items.
- An appearance stored before the face fields existed must still parse, with the defaults Round, Dark Brown, Smile.

### Task 8: Protocol for Lunch Money, the shop, and faces

**Files:** `packages/protocol/src/accounts.ts` (appearance), new `packages/protocol/src/shop.ts`, `messages.ts`, `index.ts`, `packages/server/PROTOCOL.md`. Tests in `packages/protocol/test/`.

**Produces:**
- `AppearanceSchema` gains `eyeShape`, `eyeColor`, `mouthShape`, each with `.default(...)` (round, the dark brown hex, smile). The accessory, shirt-color, and hair-color option lists gain the shop values. Face lists hold free plus shop values. Keep separate exported `FREE_*` lists of today's free values plus the free face values.
- `shop.ts`: `SHOP_ITEMS: readonly ShopItemDefinition[]`, where each is `{ id, name, kind: "extra" | "shirtColor" | "hairColor" | "eyeShape" | "eyeColor" | "mouthShape", unlocks: { field: keyof Appearance; value: string }, defaultPrice }` with the 22 items of §13.2 and §13.3. `SHOP_PRICE_LIMITS = { min: 1, max: 1000 }`. `lockedItemsIn(appearance, ownedItemIds): string[]` returns the shop item ids the look uses and the player does not own.
- `ProfileSchema` gains `lunchMoney` (non-negative integer) and `ownedItems` (string array).
- `PERMISSIONS` gains `shop.edit`. Admin does not get it.
- Messages per §13.6: `shopRequest`, `shopBuy { itemId }`, `shopConfigRequest`, `shopConfigSave { items }`, and the replies `shop { items, balance }` and `shopConfig { items, updatedAt, updatedBy }`. `AccountErrorCodeSchema` gains `NOT_OWNED`, `NOT_AVAILABLE`, `ALREADY_OWNED`, and `NOT_ENOUGH`.
- Protocol version stays 4, because this ships in the same release as Task 1.

- [ ] Failing tests: an old appearance without face fields parses with the defaults; `lockedItemsIn` for a free look (none), for a look with an unowned crown (the crown), and for one with an owned crown (none); every new message; admin lacks `shop.edit`. Implement. Protocol tests and tsc pass. Commit: `feat(protocol): Lunch Money, shop items, and face options`.

### Task 9: Server for Lunch Money and the shop

**Files:** `packages/server/src/accounts/database.ts` (migration 3), `accountStore.ts`, new `packages/server/src/shop/shopStore.ts`, `lobby/lobby.ts`. Tests: `packages/server/test/shopStore.test.ts`, `packages/server/test/shop.lobby.test.ts`, and an update to `accountStore.test.ts`.

**Behavior:**
- **Migration 3:** `lunch_money` column with the backfill, plus `owned_items` and `shop_items` tables per §13.5.
- **Store:** `recordGames` adds the score to `lunch_money`. `profileOf` includes `lunchMoney` and `ownedItems`. `buyItem(accountId, itemId, price)` runs one transaction that refuses `ALREADY_OWNED` or `NOT_ENOUGH`. `ShopStore` gives item config (price and availability, merged over the code defaults) and saves it with who and when.
- **Lobby:**
  - `shopRequest`: guests get `NOT_LOGGED_IN`.
  - `shopBuy`: refuses unavailable items. On success it sends `shop` and the updated `profile`.
  - `shopConfigRequest` and `shopConfigSave` need `shop.edit`. A price outside the limits or an unknown id gets `INVALID_SHOP`, a new `AdminErrorCode`; add it in this task's protocol touch.
  - `appearanceSet` refuses a look whose `lockedItemsIn` is not empty with `NOT_OWNED`. For guests, every shop item is locked.
  - A room captures only allowed looks.

- [ ] Failing tests per §13.8 (store and lobby). Implement. `npm test` and `npx tsc -b` pass. Commit: `feat(server): Lunch Money, the shop, and ownership checks on looks`.

### Task 10: The kid model's new extras and faces

**Files:** `packages/client-3d/src/scene/characters/KidHead.tsx` (and small new part files if it grows too large), `packages/client-3d/src/appearance/appearance.ts`.

**Behavior:**
- **The 10 new extras:** each drawn from primitives in the existing toon style.
  - The propeller spins.
  - The traffic cone and banana hat sit like hats and hide hair tufts, as the cap does.
- **Eye shapes:** each drawn with its color, a dark pupil, and a highlight. Blinking works for all of them.
- **Mouth shapes:** each is the resting mouth. The open mouth stays as it is.
- **`randomAppearance`:** generated crowd kids use free values only. Include the face fields.

- [ ] Look at every item and face in a headless-browser showroom (`?showroom` is not part of the shipped app; use a scratch page or a temporary route not committed). Commit: `feat(client): new extras, eye shapes and colors, and mouth shapes on the kid`.

### Task 11: Shop and Lunch Money in the client

**Files:** `src/state/*` (reducer, GameApi: `requestShop`, `buyItem`, `requestShopConfig`, `saveShopConfig`), `src/ui/TopBar.tsx`, `src/ui/CustomizePanel.tsx`, new `src/ui/ShopPanel.tsx`, `src/ui/CreatorPanel.tsx` (a Shop tab), `src/ui/ProfilePanel.tsx`, `src/ui/GameOverPanel.tsx`, `src/state/LocalState.tsx` (a `"shop"` panel), `src/scene/Stage.tsx` and `cameraShots.ts` (the shop shows your kid). Tests: reducer, and a pure option-row helper (owned, free, or locked with a price).

**Behavior:**
- **Top bar:** it shows the balance with a coin icon for a logged-in player, and a "Shop" button.
- **Shop panel:**
  - Items are grouped by kind, each with its price, and owned items are marked.
  - Selecting an item previews it on your kid without saving.
  - Buy is disabled when you cannot afford the item or already own it.
  - After a buy, the item is equipped and saved.
- **Customize:** owned shop values mix in with the free ones. Locked ones show a lock and the price, and choosing one opens the shop at that item. The eye-shape, eye-color, and mouth rows are new.
- **Game-over panel:** it shows "+N Lunch Money" for a logged-in player.
- **Profile:** it shows the balance.
- **Creator panel:** a Shop tab with a price field and an available switch per item, and Save.

- [ ] Tests, implement, and run `npm test`, `npm run typecheck`, and the client build. Commit: `feat(client): Lunch Money, the shop, and locked options in Customize`.
