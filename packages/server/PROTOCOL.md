# eat.io WebSocket Protocol

**Protocol version: 1.** This document is the complete contract between the eat.io
server and any client. The zod schemas in `@eat.io/protocol` are the source of truth; this
prose describes them. If they disagree, the schemas win — but they should not.

## Transport

- A single **WebSocket** connection per client. No REST, no other channel.
- Every frame is a **JSON object** with a `type` field (a discriminated union).
- Both directions are **validated on receipt**. An invalid inbound frame is answered with
  an `error` and otherwise ignored; it never affects other clients or the room.
- Frames are UTF-8 JSON text. Binary frames are not used.

## Handshake and versioning

The client's first message MUST be `hello`, carrying `protocolVersion`. If it does not equal
the server's version, the server replies with `error` `code: "PROTOCOL_MISMATCH"` and does
not create a session. On success the server replies with `welcome`, which carries the
`playerId` and a `sessionToken` (used only for reconnection).

Any non-`hello` message sent before a successful `hello` gets `error` `code: "NO_SESSION"`.

## Two kinds of failure

- **`error`** — the message was malformed, failed schema validation, was unknown, or was
  sent out of order. `code` is a short string; `message` is human-readable. Non-fatal.
- **`actionRejected`** — a well-formed `submitTurn` that was an illegal *move*. `code` is a
  machine-readable `RejectionCode` the UI can render. Non-fatal.

Every `submitTurn` receives exactly one of `actionAccepted` or `actionRejected`.

Every other client message is acknowledged too: `queueJoin` → `queueWaiting` or a
`roomState` if it paired immediately, `queueCancel` → `queueCancelled`,
`roomCreatePrivate` → `roomJoinedPrivate`, `roomLeave` → `roomLeft`, `ping` → `pong`.
Nothing is silently absorbed.

## Client → Server messages

| `type` | Fields | Sent when |
|---|---|---|
| `hello` | `protocolVersion: number`, `name: string` (1–14 chars), `sessionToken?: string` | First message. Include `sessionToken` to reconnect to an existing seat. |
| `queueJoin` | — | Enter the public matchmaking queue. |
| `queueCancel` | — | Leave the public queue. Answered with `queueCancelled`. |
| `roomCreatePrivate` | — | Create a private room; the server replies with a join code. |
| `roomJoinPrivate` | `code: string` | Join a private room by its code. |
| `submitTurn` | `cardId: string`, `targetTrayIds: string[]` | Commit this round's move: play `cardId` against the listed trays on your own table. For a card that takes N targets, send exactly N ids. |
| `roomLeave` | — | Leave the current room and return to the menu. Answered with `roomLeft`. |
| `ping` | — | Liveness check; answered with `pong`. |

`submitTurn` is the only in-game action, and it is **semantic** — it names what you did in
game terms, never UI events (no clicks/drags/selection). Selection and targeting order are
the client's business and resolve to this one committed action.

## Server → Client messages

| `type` | Fields | Sent when |
|---|---|---|
| `welcome` | `playerId: string`, `sessionToken: string` | After a valid `hello` (new session or reconnect). |
| `error` | `code: string`, `message: string` | A malformed/invalid/unknown/out-of-order message. Affects only this client. |
| `queueWaiting` | — | You joined the public queue and are waiting for an opponent. |
| `queueCancelled` | — | Acknowledges `queueCancel`; you are out of the queue. |
| `roomLeft` | — | Acknowledges `roomLeave`; you are back at the menu. Sent whether or not you were in a room. |
| `roomJoinedPrivate` | `code: string` | You created a private room; share this code. |
| `roomState` | *(full view — see below)* | **Any** change to your game: on start, after every submission, after each round resolves, on pause/resume, and on abandon. |
| `actionAccepted` | — | Your `submitTurn` was legal and recorded; awaiting the opponent. |
| `actionRejected` | `code: RejectionCode`, `message: string` | Your `submitTurn` was illegal. |
| `gameOver` | `result: Result` | The game ended (round limit reached). Terminal. |
| `opponentDisconnected` | `graceEndsAt: number` (epoch ms) | Your opponent dropped; the room is paused until they reconnect or the grace window ends. |
| `opponentReconnected` | — | Your opponent returned within the grace window; play resumes. |
| `pong` | — | Reply to `ping`. |

### `roomState` (the per-player view)

Sent to each player with **only what that player may see**. Deltas are never used — every
`roomState` is the complete current view, which makes reconnection trivial.

```
{
  "type": "roomState",
  "phase": "waiting" | "in-progress" | "paused" | "finished" | "abandoned",
  "roundIndex": number,          // 0-based; how many rounds have resolved
  "roundCount": number,          // total rounds in this game
  "deadlineAt": number | null,   // epoch ms your current move is due by; null while paused
  "you": {
    "seat": "a" | "b",
    "name": string,
    "score": number,             // total eaten so far
    "submitted": boolean,        // have you committed this round
    "table": [ { "id": string, "value": number }, ... ],   // front tray first
    "hand": [ { "id": string, "name": string, "action": "add" | "multiply",
               "amount": number, "targets": number }, ... ]
  },
  "opponent": {
    "seat": "a" | "b",
    "name": string,
    "score": number,
    "submitted": boolean,
    "handCount": number,         // COUNT only — never the opponent's cards
    "table": [ { "id": string, "value": number }, ... ]
  }
}
```

**Secrecy:** the opponent's `hand` cards and both players' decks are **absent** from the
payload — not hidden, absent. Render only what you are sent.

**Rendering from data:** card `name`, `action`, `amount`, and `targets` all come from the
server. Do not hardcode card behavior, hand size, or table length — they can change.

### `Result` (inside `gameOver`)

```
{ "kind": "win" | "loss" | "draw", "scores": { "a": number, "b": number } }
```

`kind` is relative to the receiving player. `scores` are absolute per seat. A **draw** is an
ordinary value — render it, do not treat it as a missing winner.

### `RejectionCode` values

`NOT_IN_ROOM`, `NOT_YOUR_TURN`, `ALREADY_SUBMITTED`, `CARD_NOT_HELD`,
`WRONG_TARGET_COUNT`, `BAD_TARGET`.

## Typical sequences

**Matchmake and play a round**

```
C→S hello {protocolVersion:1, name:"Riley"}
S→C welcome {playerId, sessionToken}
C→S queueJoin
S→C queueWaiting                     (until an opponent arrives)
S→C roomState {phase:"in-progress", deadlineAt, you, opponent}
C→S submitTurn {cardId, targetTrayIds}
S→C actionAccepted
S→C roomState (you.submitted:true)
   ... when both have submitted, the round resolves ...
S→C roomState (roundIndex incremented, new deadlineAt)
```

**Disconnect and reconnect**

```
(socket drops — either the TCP connection closes, or the server's
 ping goes unanswered for HEARTBEAT_TIMEOUT_MS and the socket is dropped)
S→C(opponent) opponentDisconnected {graceEndsAt}     room is now paused
(within grace, dropped client opens a new socket)
C→S hello {protocolVersion:1, name:"Riley", sessionToken:<same token>}
S→C welcome {playerId:<same>, sessionToken:<same>}
S→C(opponent) opponentReconnected
S→C(both) roomState {phase:"in-progress", ...}       full view resent
```

**Turn clock expiry (connected but idle)**

```
(you do not submit before deadlineAt; you are still connected)
   server auto-discards one random card from your hand (no tray effect)
S→C roomState (round resolved)
```

## Server shutdown

On a clean shutdown the server resolves every live room before closing sockets: each
player receives a final `roomState` with `phase: "abandoned"`, then the socket is closed
with code `1001`. A client should treat that as the game ending, not as a network blip
to retry into.
