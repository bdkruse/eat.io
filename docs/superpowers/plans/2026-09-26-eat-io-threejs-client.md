# eat.io three.js Client Implementation Plan

> **For agentic workers:** Executed natively in one session (the owner was away). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3D eat.io client in `packages/client-3d`: a busy school cafeteria, a camera that flies to a top-down game table, and a local customization screen.

**Architecture:** React Three Fiber renders the scene. React DOM panels sit over the canvas. Game state, connection, and selection logic are imported from `packages/client/src` through the `@eat.io/client/*` alias, so the 3D client adds presentation only.

**Tech Stack:** Vite 5, React 19, three 0.186, @react-three/fiber 9, @react-three/drei 10, TypeScript strict, vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-eat-io-threejs-client-design.md`

## Global Constraints

- Do not modify or remove anything under `packages/client`, `packages/server`, or `packages/protocol`.
- The client computes no game state. Every number on screen comes from the server.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never "plate."
- Full, descriptive variable names.
- No third-party network requests at runtime. Fonts come from `@fontsource/*`. No drei helpers that fetch from a CDN (`Text`, `Environment` presets).
- Background kids are generated from a seeded source, so the room is the same on every load.

## Review Focus

1. A tray value above well capacity (for example 40 after a triple). Expect the food to cap and a `+N` chip to show the rest.
2. A reconnect mid-game. Expect the board to gray out and ignore clicks, then recover.
3. A second game after Play again. Expect no ghost trays, no stale selection, and the camera to return to the table.
4. Clicking an opponent tray or clicking a tray with no card. Expect nothing, or the "pick a card first" toast.
5. A small or wide browser window. Expect the hand bar and HUD to stay usable and the table to stay framed.

---

### Task 1: Scaffold the package and pure layout modules

**Files:**
- Create: `packages/client-3d/{package.json,tsconfig.json,vite.config.ts,index.html}`
- Create: `packages/client-3d/src/scene/game/tableLayout.ts`
- Create: `packages/client-3d/src/scene/cameraShots.ts`
- Create: `packages/client-3d/src/appearance/appearance.ts`
- Modify: root `package.json` (workspace, `dev:3d`, typecheck), root `vitest.config.ts` (alias)
- Test: `packages/client-3d/test/{tableLayout,cameraShots,appearance}.test.ts`

**Interfaces (produces):**
- `traySlotPosition(side: "near" | "far", slot: number): [x, y, z]`. Slot 0 is nearest the eater at the +X head of the table.
- `EATER_POSITION`, `SEAT_POSITION.near/far`, `TABLE_DIMENSIONS`.
- `trayFoodPositions(trayId, value): { items: FoodItem[]; overflow: number }` built on `layoutTray`.
- `type ShotName = "menu" | "customize" | "queue" | "game" | "gameOver"`, `selectShot(screen, customizing): ShotName`, `CAMERA_SHOTS: Record<ShotName, { position; target; fov }>`.
- `interface Appearance { skinTone; hairStyle; hairColor; shirtColor; pantsColor; accessory }`, option lists, `randomAppearance(seed: number): Appearance`, `appearanceFromName(name: string): Appearance`.

- [ ] Write failing tests for these rules:
  - Slot 0 is nearer the eater than slot 4 on both sides, and the near side has positive Z.
  - Food never exceeds capacity, and overflow equals the rest.
  - Every screen maps to a shot.
  - Appearance generation is deterministic and uses only listed options.
- [ ] Run `npx vitest run packages/client-3d` and see them fail.
- [ ] Implement the three modules.
- [ ] Run tests and `npm run typecheck`. Expect PASS.
- [ ] Commit.

### Task 2: Materials, the kid, and the eater

**Files:** `src/scene/materials.ts`, `src/scene/characters/Kid.tsx`, `src/scene/characters/poses.ts`

**Interfaces:** `toonMaterial(color: string): MeshToonMaterial` (cached). `<Kid appearance pose animation mouthOpen? />` where `pose` is `"stand" | "walk" | "sit"` and `animation` is `"idle" | "eat" | "chat" | "cheer" | "slump" | "chomp"`. The mouth is its own mesh.

- [ ] Build the kid from primitives with five hair styles and five accessories.
- [ ] Look at it in the browser on a test stage. Commit.

### Task 3: The cafeteria

**Files:** `src/scene/cafeteria/{Room,ServingLine,Decor,DiningTables,Crowd,WallClock,labelTexture}.tsx|ts`, `src/scene/Stage.tsx`

- [ ] Room, lighting, and shadows. Serving line with staff and steam. Decor. Dining tables with seated kids. Walking crowd on looping paths.
- [ ] Take screenshots from the menu shot. Commit.

### Task 4: The game table

**Files:** `src/scene/game/{GameTable,Tray3D,FoodItem3D,TrayLabel}.tsx`

**Interfaces:** `<GameTable room selection targetCount onTrayClick frozen outcome />`. Reuses `useEatenTrays` and `useScorePop` from the classic client.

- [ ] Table, benches, your kid, opponent kid, eater. Trays with food, labels, selection lift, order badges, advance easing, eaten slide, chomp.
- [ ] Play a live game against a local server. Commit.

### Task 5: Camera rig and DOM panels

**Files:** `src/scene/CameraRig.tsx`, `src/ui/{MenuPanel,CustomizePanel,QueuePanel,GameHud,HandBar,GameOverPanel,Overlays,FadePresence}.tsx`, `src/ui/styles/*.css`, `src/App.tsx`, `src/main.tsx`, `src/appearance/AppearanceProvider.tsx`

- [ ] Camera eases between shots. Panels fade. Menu, customize, queue, HUD, hand, game over, toast, banner, modal.
- [ ] Play a full game in two windows against a local server. Commit.

### Task 6: Docs and final review

- [ ] `packages/client-3d/README.md`, root README entry.
- [ ] Full test run, typecheck, production build.
- [ ] Whole-branch review by a fresh reviewer. Fix findings. Commit.
