# @eat.io/client-3d

A 3D front end for eat.io, built with three.js. The game happens at one table in a busy
school cafeteria. The cafeteria is the living background of the menu. When a match starts,
the menu fades and the camera flies down to a top-down view of the game table. You sit on
the near side, your opponent on the far side, and the eater sits at the head.

It plays the same game as the React client in `packages/client`, against the same server.
The React client is unchanged and still runs on its own.

## Run it

```bash
npm install          # from the repo root
npm start            # terminal 1: the game server on :8000
npm run dev:3d       # terminal 2: Vite on http://localhost:5174
```

Open the URL in two browser windows to play both seats. The server field on the menu
defaults to `ws://localhost:8000`, the same as the classic client. If port 8000 is busy,
start the server with `PORT=8765 npm start` and type `ws://localhost:8765` in the field.

`ROUND_COUNT=3 npm start` makes a short game.

## Stack

- React Three Fiber 9 and drei 10 on three.js 0.186. The scene is React components, so
  the 3D client reuses the classic client's state layer with no adapter.
- Every model is built in code from three.js primitives. There are no model files, image
  files, or runtime network requests. Posters and signs are painted onto canvases.
- `MeshToonMaterial` with a three-band gradient gives the cel-shaded look. All materials
  come from `src/scene/materials.ts`, so the style stays consistent.

## What it reuses from the classic client

The `@eat.io/client/*` alias points at `packages/client/src`. The 3D client imports these
modules directly, so there is one copy of each:

| Module | Purpose |
|---|---|
| `state/GameProvider.tsx`, `gameReducer.ts`, `gameState.ts` | Server messages become one state object |
| `state/selection.ts` | Card and tray selection rules |
| `connection/*` | Socket lifecycle and reconnect |
| `food/foodLayout.ts` | Food placement that never rearranges |
| `components/board/useEatenTrays.ts`, `useScorePop.ts` | Motion that never delays state |
| `components/overlays/*` | Toast, connection banner, opponent-dropped modal |

The 3D client adds presentation only. It computes no game state, and every number on
screen comes from the server.

## Layout

```
src/
  App.tsx                 providers, the canvas, and the panels over it
  state/LocalState.tsx    appearance, customize screen, and this turn's selection
  appearance/             kid appearance options and seeded generation
  scene/
    Stage.tsx             the canvas; picks the camera shot from the screen
    CameraRig.tsx         eases between shots and fits narrow windows
    cameraShots.ts        the shots, as data
    characters/           the kid model and the pose vocabulary
    cafeteria/            room, serving line, decor, tables, walking crowd
    game/                 the game table, trays, and food
  ui/                     menu, customize, queue, scoreboard, hand, result
```

## Controls

Click a card, then click trays on your side of the table. Keys `1` to `5` pick a card,
`Enter` ends the turn, and `Esc` clears the pick.

## Detail levels

The High / Low switch in the top corner changes how much of the room is drawn. It works on
every screen, including mid-game, and it resets when you reload.

| | High | Low |
|---|---|---|
| Shadows | On | Off |
| Pixel density | Up to 2x | 1x |
| Seated kids | All | Every other one |
| Kids in the lunch line | All | Every other one |
| Walking kids | 3 per aisle loop | 1 per aisle loop |
| Steam over the food | On | Off |

Low detail draws a fixed subset of the same kids, so switching never reshuffles the room.
The game table is identical in both modes. The budgets are data in `src/scene/detail.ts`.

## Customization

Skin tone, hair style, hair color, shirt, pants, and one extra (glasses, cap, headband, or
beanie). The look is local only. It does not persist, and the opponent does not see it.
Your opponent's kid is generated from their name, so the same name always looks the same.

## Known limitations

- The production bundle is about 1.7 MB (450 KB gzipped), mostly three.js. Vite warns
  about the chunk size.
- About 85 animated kids are in the room at high detail. On a slow machine, use Low.
- The kids have no collision. Walkers follow fixed aisles, so they do not cross tables,
  but two walkers can pass through each other.
- No sound.
