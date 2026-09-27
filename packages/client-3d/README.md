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

For a short game, lower the round count in the Admin panel. `ROUND_COUNT` only seeds a
fresh database, so `DATABASE_PATH=:memory: ROUND_COUNT=3 npm start` also makes a short
game, with a throwaway database and no accounts.

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
  hooks/                  eaten-tray, boosted-tray, and score-pop motion, retained panel data
  appearance/             kid appearance options and seeded generation
  scene/
    Stage.tsx             the canvas; picks the camera shot from the screen
    CameraRig.tsx         eases between shots and fits narrow windows
    cameraShots.ts        the shots, as data
    characters/           the kid model and the pose vocabulary
    cafeteria/            room, serving line, decor, tables, walking crowd
    game/                 the game table, trays, and food
  ui/                     menu, customize, queue, scoreboard, hand, result, admin, creator, shop
```

## Controls

Click a card, then click trays on your side of the table. Keys `1` to `5` pick a card,
`Enter` ends the turn, and `Esc` clears the pick.

A card that takes no trays says "no trays" and is ready as soon as you pick it. "Add One
Food To Every Tray" shows `+1 all`. "Extra Servings" shows `+2 ×2`.

## Extra servings on the table

Upcoming extra servings show in a small marker at the foot of each player's row of trays,
for example "+2, +2". The first number rides on the next tray to arrive. The marker
shrinks as the trays arrive. It hides once the list is empty. A tray that arrives with a
bonus glows gold for a moment as it slides on. The server adds the bonus and marks that
tray with a `bonus` field. The client only shows it.

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

## Accounts

A player can register, log in, and see their profile from the menu panels, or skip all of
it and play as a guest. Logging in or registering stores a login token in the browser's
`localStorage`, under the key `eatio.loginToken`, for 30 days. On a later visit the stored
token resumes the account automatically, with no password prompt. Logging out, or an
expired or unknown token, clears it and the session continues as a guest.

The top bar shows a logged-in player's Lunch Money balance, with a coin icon, next to the
profile button. The profile panel shows it too. At game over, a logged-in player sees
"+N Lunch Money", where N is their score. A guest sees no balance and earns nothing.

Account rules (username and password format, roles, stats) are documented in
[`packages/server/README.md`](../server/README.md). The wire messages are in
[`PROTOCOL.md`](../server/PROTOCOL.md).

## Customization

Skin tone, hair style, hair color, eyes, eye color, mouth, shirt, pants, and one extra.
The free extras are glasses, a cap, a headband, and a beanie. The face options are:

| Option | Free | In the shop |
|---|---|---|
| Eyes | Round, Almond, Sleepy, Sparkly | Star Eyes, Heart Eyes |
| Eye color | Dark Brown, Brown, Hazel, Green, Blue, Gray | Violet, Glowing Gold |
| Mouth | Smile, Big Grin, Calm, Smirk | Tongue Out, Vampire Fangs |

The mouth shape sets the resting mouth. The kid still opens its mouth to talk and chomp.

Shop values you own show in the rows with the free ones. A shop value you do not own
shows a lock and its price. Picking it opens the shop at that item. A guest sees only the
free values.

Edits stay local until you press Done. Done saves the look to a logged-in player's
account. For a guest, Done shares the look with the opponent until the page reloads. An
opponent who never set a look gets one generated from their name, so the same name
always looks the same.

## Shop

A logged-in player sees a Shop button in the top bar. The shop lists every item for
sale, grouped by kind, with its price. Items you own say "Owned". Picking an item tries it
on your kid, and nothing is saved. Picking it again takes it off. Buy is disabled for an
item you own, and for one you cannot afford, with a note of how much more you need. A buy
spends Lunch Money, then the kid wears the item and the look is saved. Closing a shop
opened from Customize returns you to Customize.

## Admin and Creator panels

The top bar shows an Admin button to a profile with `settings.edit`, and a Creator button
to a profile with `deck.edit`. The Admin, Creator, and Shop buttons and the balance are
hidden during a game, like the profile button. With the Admin or Creator panel open, the
camera uses the menu shot.

- **Admin:** the round count, the turn clock, and the hand size, each with its range.
- **Creator, Deck tab:** one row per card, with its glyph, name, and tray count, and a
  quantity with − and + buttons and a number field. A live total shows the 10 to 100
  limit.
- **Creator, Shop tab:** one row per shop item, with a price (1 to 1000) and an Available
  switch. Only a profile with `shop.edit` sees this tab.

Save is disabled while a value is outside its limit, and the problem shows under the
fields. Each panel shows "Last changed by <name>, <date and time>". A save changes the
next game, not one in progress. The limits and the edit permissions are in
[`packages/server/README.md`](../server/README.md).

Profile, Customize, Shop, Admin, and Creator never show at the same time. Opening one
closes the others, and entering a room closes them all.

## Known limitations

- The production bundle is about 1.7 MB (450 KB gzipped), mostly three.js. Vite warns
  about the chunk size.
- About 85 animated kids are in the room at high detail. On a slow machine, use Low.
- The kids have no collision. Walkers follow fixed aisles, so they do not cross tables,
  but two walkers can pass through each other.
- No sound.
