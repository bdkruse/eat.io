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

Design docs live in `docs/superpowers/`.
