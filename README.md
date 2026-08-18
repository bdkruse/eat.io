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

## Try it

There is no client yet, so `scripts/play-demo.mjs` connects two bots over real
WebSockets and plays a full game — matchmaking, per-round scoring, and a
viewer-relative result:

```bash
npm start                      # terminal 1
node scripts/play-demo.mjs     # terminal 2
```

Both honour `PORT`. `RNG_SEED=42 npm start` replays an identical game, and
`ROUND_COUNT=3` makes it short.

Design docs live in `docs/superpowers/`.
