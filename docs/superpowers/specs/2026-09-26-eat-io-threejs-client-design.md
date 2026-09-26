# eat.io three.js Client — Design Spec

**Date:** 2026-09-26
**Scope:** A second, 3D front end for eat.io, built with three.js. It does everything the
React client in `packages/client` does. The existing client, the server, and
`@eat.io/protocol` stay in place and are not changed.

---

## 1. Intent

The owner wants to see what eat.io feels like as a 3D scene. The game is played at a
table in a busy school cafeteria full of ten-year-olds. The cafeteria is the living
background of the menu. When a game starts, the menu fades and the camera flies to a
top-down view of the game table. Player one sits on one side, player two on the other,
and the eater sits at the end of the table. The look is cartoony but not goofy. A simple
customization screen lets the player change how their kid looks. Customization does not
persist.

Success: a player can connect, customize, queue or use a private room, and play a full
game. They see the result and can play again. All of it happens inside the 3D scene, with
the same rules and the same server as the React client.

## 2. Decisions

The owner did not answer the clarifying questions before walking away. These are the
recommended defaults, chosen so that none of them is hard to reverse.

| Question | Decision | Reason |
|---|---|---|
| Location | New workspace `packages/client-3d` (`@eat.io/client-3d`) | The old client stays runnable, untouched. |
| Stack | React Three Fiber 9 + drei 10 on three.js 0.18x | Reuses the tested state and connection layers unchanged. Menus stay React DOM. |
| Assets | Every model is built in code from three.js primitives | One consistent style, no downloads, no licenses, no binary files. |
| Opponent look | Local only. The opponent's kid is generated from their name | No protocol or server change. |
| Persistence | None. Appearance lives in React state | The owner asked for no persistence. |

### Reuse, not copy

The new client imports these modules from `packages/client/src` through a path alias
(`@eat.io/client/*`), so there is one copy of each:

- `state/GameProvider.tsx`, `state/gameState.ts`, `state/selection.ts` (reducer, selectors,
  selection rules)
- `connection/*` (socket lifecycle, reconnect)
- `config.ts` (server URL)
- `food/foodLayout.ts` (deterministic food placement)
- `components/board/useEatenTrays.ts` and `useScorePop.ts` (motion that never delays state)

The client's rules carry over: it computes no game state, and every number on screen comes
from the server.

## 3. Scene

World units are meters. A kid is about 1.35 m tall.

**The room.** The room has a tiled floor, painted cinder-block walls, tall windows, and
hanging lights. The walls carry a clock with moving hands, posters, a bulletin board, a
banner, and flags. Trash and recycling bins, a milk cooler, and a vending machine stand
along the walls.

**The serving line.** A steel counter with a sneeze guard, food pans with steam, a line of
kids with trays, and lunch staff serving.

**The crowd.** Eight or so dining tables with seated kids who eat, chat, turn to each
other, and laugh. Kids walk between the line, the tables, and the bins on looping paths.
All background kids are generated from a seeded random source, so the room looks the same
on every load.

**The game table.** A table near the front of the room. Seat one (you) is on the near side,
seat two (opponent) on the far side, the eater at the head. Each player's five trays sit in
a row on their side. The front tray (`table[0]`, the next one eaten) is nearest the eater.
Your kid sits at the game table during the menu. Before a match, the opponent seat is empty.

**Style.** Surfaces use `MeshToonMaterial` with a three-step gradient for cel shading.
Colors are soft pastels from the existing tokens: tomato for you, blue for the opponent,
cream tray plastic, and formica green. One shadow-casting sun plus a hemisphere fill. Rounded shapes,
no exaggerated proportions.

## 4. Camera shots

A camera rig eases between named shots. The shot is a pure function of the screen.

| Screen | Shot |
|---|---|
| Menu (connect) | Wide, slow drift across the cafeteria, framing the game table |
| Customize | Close-up of your kid, standing, turning slowly |
| Queue | Menu shot, pushed in toward the game table |
| Game | Top-down over the game table, your side at the bottom of the screen |
| Game over | Low angle on the game table showing both kids react |

## 5. Interface (DOM over the canvas)

- **Menu panel:** name, server, Connect. After connecting: Find a game, Create a private
  room, Join with code. A Customize button is always there.
- **Customize panel:** skin tone, hair style, hair color, shirt color, accessory, a
  Randomize button, and Done.
- **Queue panel:** "Finding you a lunch buddy" or the private room code, and Cancel.
- **Game HUD:** both names and scores (score pops on change), ready chips, and the round
  counter. A bottom bar with the status pill, End turn, and the hand of cards.
- **Game over panel:** win, loss, or draw headline, both scores, Play again, Back to menu.
- **Overlays:** rejection toast, connection-lost banner, opponent-dropped modal.

Panels fade in and out. The menu fades away as the camera flies to the table.

## 6. Game table behavior

- Trays are 3D. Food is one item per point, placed with `layoutTray` so a tray gains or
  loses food without the rest moving. A number label shows each tray's value. If food
  overflows the tray, a `+N` chip shows the rest.
- You click your own trays in the 3D view. Opponent trays are not clickable. Selected trays
  lift and glow, and multi-target cards show numbered badges.
- When the table advances, trays ease to their new positions. The eaten tray slides into the
  eater, who chomps. Both players' front trays are eaten each round.
- A frozen board (connection lost) turns gray and ignores clicks.
- At game over the winner cheers. On a draw, both kids cheer.

## 7. Testing

Logic only, matching the existing client: appearance generation, table layout (slot to
world position, front tray nearest the eater), and screen-to-shot selection. The scene is
verified by playing it in a browser against a local server and taking screenshots.

## 8. Out of scope

Persisting appearance, sending appearance to the opponent, sound, mobile touch tuning, and
removing the old client.
