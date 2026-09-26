# @eat.io/client-3d

A 3D front end for eat.io, built with three.js. The game happens at one table in a busy
school cafeteria. The cafeteria is the living background of the menu. When a match starts,
the menu fades and the camera flies down to a top-down view of the game table. You sit on
the near side, your opponent on the far side, and the eater sits at the head.

It is the only client. It renders what the server sends and sends back what the player
tried. It computes no game state, and every number on screen comes from the server.

## Run it

```bash
npm install          # from the repo root
npm start            # terminal 1: the game server on :8000
npm run dev:3d       # terminal 2: Vite on http://localhost:5174
```

Open the URL in two browser windows to play both seats. In development the menu has a
Server field that defaults to `ws://localhost:8000`. If port 8000 is busy, start the
server with `PORT=8765 npm start` and type `ws://localhost:8765` in the field.

`ROUND_COUNT=3 npm start` makes a short game.

## Deploy it

Set the server address at build time. A build with `VITE_SERVER_URL` does not show the
Server field, so players are never asked for a port.

```bash
VITE_SERVER_URL=wss://play.example.com npm run build --workspace @eat.io/client-3d
```

The output in `packages/client-3d/dist` is static files for any static host. A page
served over HTTPS must use a `wss://` address.

## Stack

- React Three Fiber 9 and drei 10 on three.js 0.186. The scene is React components, so
  one React state layer drives both the 3D scene and the panels.
- Every model is built in code from three.js primitives. There are no model files, image
  files, or runtime network requests. Posters and signs are painted onto canvases.
- `MeshToonMaterial` with a three-band gradient gives the cel-shaded look. All materials
  come from `src/scene/materials.ts`, so the style stays consistent.

## Game state and connection

These modules came from the earlier 2D client, which was removed. They are still the
tested core of the client.

| Module | Purpose |
|---|---|
| `state/gameReducer.ts`, `gameState.ts`, `GameProvider.tsx` | One pure reducer turns server messages into one state object |
| `state/selection.ts` | Card and tray selection rules |
| `connection/*` | Socket lifecycle, message validation, reconnect with backoff |
| `food/foodLayout.ts` | Stable food placement: a value change never moves the other food |
| `hooks/useEatenTrays.ts`, `useScorePop.ts` | Motion that never delays state |
| `ui/overlays/*` | Toast, connection banner, opponent-dropped modal |

## Layout

```
src/
  App.tsx                 providers, the canvas, and the panels over it
  config.ts               the server address, from VITE_SERVER_URL
  connection/             the socket and its reconnect state machine
  state/                  the game reducer, and LocalState for appearance and selection
  food/                   deterministic food placement
  hooks/                  eaten-tray and score-pop motion, retained panel data
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
every screen, including mid-game. The choice resets on reload.

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
