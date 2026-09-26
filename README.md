# eat.io

A two-player game about trays of food advancing down a table and being eaten for points.
An npm-workspaces monorepo:

- **`packages/protocol`** (`@eat.io/protocol`) — the shared, versioned wire contract: zod
  schemas that are the single source of truth for both runtime validation and TypeScript
  types.
- **`packages/server`** (`@eat.io/server`) — the authoritative WebSocket game server. See
  its [README](./packages/server/README.md) and [PROTOCOL.md](./packages/server/PROTOCOL.md).
- **`packages/client-3d`** (`@eat.io/client-3d`) — the game client: a three.js front end
  set in a 3D school cafeteria. See its [README](./packages/client-3d/README.md).

```bash
npm install
npm test            # all package tests
npm run typecheck   # strict tsc across all packages

npm start           # terminal 1 — the game server on :8000
npm run dev:3d      # terminal 2 — the client on :5174; open it in two windows to play
```

With no browser handy, `node scripts/play-demo.mjs` runs two bots through a full game
against the server.

## Try it

Without a browser, `scripts/play-demo.mjs` connects two bots over real WebSockets and
plays a full game — matchmaking, per-round scoring, and a viewer-relative result:

```bash
npm start                      # terminal 1
node scripts/play-demo.mjs     # terminal 2
```

Both honour `PORT`. `RNG_SEED=42 npm start` replays an identical game, and
`ROUND_COUNT=3` makes it short.

Design docs live in `docs/superpowers/`.
