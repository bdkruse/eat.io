# eat.io WebSocket Protocol

**Protocol version: 5.** This document is the complete contract between the eat.io
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
A second `hello` on a connection that already has a session gets `error`
`code: "ALREADY_GREETED"`. The existing session stays as it is. No new session is created.

## Two kinds of failure

- **`error`** — the message was malformed, failed schema validation, was unknown, or was
  sent out of order. `code` is a short string; `message` is human-readable. Non-fatal.
- **`actionRejected`** — a well-formed `submitTurn` that was an illegal *move*. `code` is a
  machine-readable `RejectionCode` the UI can render. Non-fatal.

Every `submitTurn` receives exactly one of `actionAccepted` or `actionRejected`.

Every other client message is acknowledged too: `queueJoin` → `queueWaiting` or a
`roomState` if it paired immediately, `queueCancel` → `queueCancelled`,
`roomCreatePrivate` → `roomJoinedPrivate`, `practiceStart` → `roomState`,
`roomLeave` → `roomLeft`, `ping` → `pong`.
Nothing is silently absorbed.

## Client → Server messages

| `type` | Fields | Sent when |
|---|---|---|
| `hello` | `protocolVersion: number`, `name: string` (1–14 chars), `sessionToken?: string`, `loginToken?: string` | First message. Include `sessionToken` to reconnect to an existing seat. Include `loginToken` to resume a logged-in account (see Accounts below). |
| `queueJoin` | — | Enter the public matchmaking queue. |
| `queueCancel` | — | Leave the public queue. Answered with `queueCancelled`. |
| `roomCreatePrivate` | — | Create a private room; the server replies with a join code. |
| `roomJoinPrivate` | `code: string` | Join a private room by its four-digit code. A code is consumed on use and cannot be joined by its own host; either failure returns `error` `NO_SUCH_ROOM`. |
| `submitTurn` | `cardInstanceId: string`, `targetTrayIds: string[]` | Commit this round's move: play that specific card from your hand against the listed trays on your own table. For a card that takes N targets, send exactly N ids. **Send `card.instanceId`, not `card.id`** — see below. |
| `roomLeave` | — | Leave the current room and return to the menu. Answered with `roomLeft`. |
| `practiceStart` | — | Start a practice game against the server's bot (see Practice games below). Answered with the usual `roomState` messages, with `mode: "practice"`. Refused with an `error` if you are already in a room or in the queue. |
| `ping` | — | Liveness check; answered with `pong`. |
| `accountRegister` | `username: string`, `password: string` | Create an account. The field limits on the wire are loose; the server applies the real username/password rules and answers `accountError` with a specific code on failure. |
| `accountLogin` | `username: string`, `password: string` | Log in to an existing account. |
| `accountLogout` | — | Log out of the current account. Answered with `accountLoggedOut` `reason: "requested"`. |
| `accountChangePassword` | `currentPassword: string`, `newPassword: string` | Change the password on the logged-in account. Answered with `passwordChanged` or `accountError`. |
| `appearanceSet` | `appearance: Appearance` | Set the sender's on-board look. For a logged-in session this also saves to the account. |
| `profileRequest` | — | Ask for the current account's profile. Answered with `profile`. |
| `settingsRequest` | — | Ask for the current game settings. Requires `settings.edit`. Answered with `settings` or `adminError`. |
| `settingsSave` | `roundCount: number`, `turnSeconds: number`, `handSize: number` | Save new game settings. Requires `settings.edit`. The field limits on the wire are loose; the server applies the real ranges (see Limits below) and answers `adminError` `INVALID_SETTINGS` on failure, never a generic `error`. Answered with `settings` on success. |
| `deckRequest` | — | Ask for the current default deck. Requires `deck.edit`. Answered with `deck` or `adminError`. |
| `deckSave` | `cards: { cardId: string, copies: number }[]` (max 200 entries) | Save a new default deck. Requires `deck.edit`. `copies` must be a whole number on the wire — a non-integer fails schema validation (`error`), not `adminError`. Once schema-valid, an unknown/duplicate card id, copies outside 0–40, or a deck total outside 10–100 answers `adminError` `INVALID_DECK`. Answered with `deck` on success. |
| `shopRequest` | — | Ask for the shop and your Lunch Money balance. Logged-in only. Answered with `shop`, or `accountError` `NOT_LOGGED_IN` for a guest. |
| `shopBuy` | `itemId: string` | Buy one shop item. Logged-in only. Answered with `shop` and the updated `profile`, or `accountError` `NOT_LOGGED_IN`, `NOT_AVAILABLE`, `ALREADY_OWNED`, or `NOT_ENOUGH`. |
| `shopConfigRequest` | — | Ask for the Creator's shop config. Requires `shop.edit`. Answered with `shopConfig` or `adminError`. |
| `shopConfigSave` | `items: { itemId: string, price: number, available: boolean }[]` (max 200 entries) | Save item prices and availability. Requires `shop.edit`. `price` is loose on the wire; an unknown item id or a price that is not a whole number from 1 to 1000 answers `adminError` `INVALID_SHOP`. Answered with `shopConfig` on success. |

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
| `roomJoinedPrivate` | `code: string` | You created a private room; share this **four-digit** code. |
| `roomState` | *(full view — see below)* | **Any** change to your game: on start, after every submission, after each round resolves, on pause/resume, and on abandon. |
| `actionAccepted` | — | Your `submitTurn` was legal and recorded; awaiting the opponent. |
| `actionRejected` | `code: RejectionCode`, `message: string` | Your `submitTurn` was illegal. |
| `gameOver` | `result: Result` | The game ended (round limit reached). Terminal. |
| `opponentDisconnected` | `graceEndsAt: number` (epoch ms) | Your opponent dropped; the room is paused until they reconnect or the grace window ends. |
| `opponentReconnected` | — | Your opponent returned within the grace window; play resumes. |
| `pong` | — | Reply to `ping`. |
| `accountLoggedIn` | `profile: Profile`, `loginToken?: string` | A successful `accountRegister`/`accountLogin`, or a resumed `hello` with a valid `loginToken`. `loginToken` is present for a new login and absent on a resume. |
| `accountLoggedOut` | `reason: "requested" \| "expired"` | Acknowledges `accountLogout` (`"requested"`), or a `hello` with an unknown/expired `loginToken` (`"expired"`; the session continues as a guest). |
| `accountError` | `code: AccountErrorCode`, `message: string` | An account operation failed. See account error codes below. |
| `profile` | `profile: Profile` | Answers `profileRequest`. |
| `passwordChanged` | — | Acknowledges a successful `accountChangePassword`. |
| `settings` | `settings: GameSettings`, `updatedAt: number \| null`, `updatedBy: string \| null` | Answers `settingsRequest` or a successful `settingsSave`. `updatedAt`/`updatedBy` are null until the first save. |
| `deck` | `cards: DeckCard[]`, `total: number`, `updatedAt: number \| null`, `updatedBy: string \| null` | Answers `deckRequest` or a successful `deckSave`. `cards` lists every catalog card with its `copies`; `total` is the sum. |
| `shop` | `items: ShopItem[]`, `balance: number` | Answers `shopRequest` or a successful `shopBuy`. `balance` is your Lunch Money. |
| `shopConfig` | `items: ShopItem[]`, `updatedAt: number \| null`, `updatedBy: string \| null` | Answers `shopConfigRequest` or a successful `shopConfigSave`. Lists every catalog item, including ones turned off. `updatedAt`/`updatedBy` are null until the first save. |
| `adminError` | `code: AdminErrorCode`, `message: string` | A settings/deck/shop config request or save failed. See Admin error codes below. |

### `roomState` (the per-player view)

Sent to each player with **only what that player may see**. Deltas are never used — every
`roomState` is the complete current view, which makes reconnection trivial.

```
{
  "type": "roomState",
  "mode": "match" | "practice",  // "practice": a one-player game against the bot
  "phase": "waiting" | "in-progress" | "paused" | "finished" | "abandoned",
  "roundIndex": number,          // 0-based; how many rounds have resolved
  "roundCount": number,          // total rounds in this game
  "deadlineAt": number | null,   // epoch ms your current move is due by; null while paused
  "you": {
    "seat": "a" | "b",
    "name": string,
    "score": number,             // total eaten so far
    "submitted": boolean,        // have you committed this round
    "appearance": Appearance | null,   // null if never set
    "table": [ { "id": string, "value": number,
                 "bonus?": number }, ... ],   // front tray first; bonus: see below
    "hand": [ { "id": string, "instanceId": string, "name": string,
               "action": "add" | "multiply" | "addAll" | "extraServings",
               "amount": number, "targets": number,
               "turns?": number }, ... ],   // present only on "extraServings"
    "extraServings": number[]     // upcoming bonuses; index 0 boosts the next tray to arrive
  },
  "opponent": {
    "seat": "a" | "b",
    "name": string,
    "score": number,
    "submitted": boolean,
    "appearance": Appearance | null,   // null if never set
    "handCount": number,         // COUNT only — never the opponent's cards
    "table": [ { "id": string, "value": number,
                 "bonus?": number }, ... ],
    "extraServings": number[]     // public, same shape as `you.extraServings`
  }
}
```

**`mode`:** `"practice"` for a practice game started with `practiceStart`, `"match"` for
every other game (public queue or private room). Always present.

**Secrecy:** the opponent's `hand` cards and both players' decks are **absent** from the
payload — not hidden, absent. Render only what you are sent.

**Rendering from data:** card `name`, `action`, `amount`, `targets`, and `turns` all come
from the server. Do not hardcode card behavior, hand size, or table length — they can
change. `targets` can be `0` for a card that needs no tray choice; `turns` is present only
on `extraServings`.

### Tray effects and table effects

A card's `action` is one of two kinds:

- **Tray effects** (`add`, `multiply`) change each chosen tray. `targets` is the number of
  trays `submitTurn.targetTrayIds` must name.
- **Table effects** (`addAll`, `extraServings`) take no tray choice — `targets` is always
  `0`, and `submitTurn.targetTrayIds` must be an empty array (`WRONG_TARGET_COUNT`
  otherwise). `addAll` adds `amount` to every tray on the player's own table right away.
  `extraServings` is described below.

### `extraServings` (the per-player view field, not the card)

Each player's view carries `extraServings: number[]`, a public list of upcoming bonuses.
Index 0 is the bonus for the next tray to arrive at that player's table. A round resolves
in this order:

1. **The played card's effect.** An `extraServings` card adds its `amount` to each of the
   next `turns` entries in the list, extending the list with zeros first if it is shorter.
   Overlapping cards add up.
2. **The front tray is eaten**, as today.
3. **A fresh tray arrives.** Its value is the random value plus `extraServings[0]`; that
   entry is then removed. An empty list adds nothing. A tray that arrived with a bonus
   carries `bonus`, the amount already folded into its `value`, for as long as it stays on
   the table. Every other tray has no `bonus` field. Use it to mark a tray that just
   arrived boosted: a card played this round has already added to and used up
   `extraServings[0]` by the time the next `roomState` is sent, so the list alone cannot
   tell you.

A card played this round boosts the tray that arrives at the end of this round, and the
`turns − 1` trays after it. Both players' lists are public — render your opponent's the
same way you render your own.

### The two card ids

Each card in hand carries **two** identifiers, and they answer different questions:

- **`id`** — *which card this is.* The catalog id, shared by every copy of that card, and
  the natural key for a future database row. Two "Add One Food To One Tray" cards in the
  same hand have the same `id`.
- **`instanceId`** — *which copy this is.* Unique within a game. Use it as a list key and
  as the thing `submitTurn` names.

`submitTurn` takes `cardInstanceId`. Sending a catalog id there is a schema error, not a
guess the server will resolve for you — that ambiguity is exactly what the two fields
exist to prevent.

### `Result` (inside `gameOver`)

```
{ "kind": "win" | "loss" | "draw", "scores": { "a": number, "b": number } }
```

`kind` is relative to the receiving player. `scores` are absolute per seat. A **draw** is an
ordinary value — render it, do not treat it as a missing winner.

### `RejectionCode` values

`NOT_IN_ROOM`, `NOT_YOUR_TURN`, `ALREADY_SUBMITTED`, `CARD_NOT_HELD`,
`WRONG_TARGET_COUNT`, `BAD_TARGET`.

## Accounts, appearance, and profiles

**`Appearance`.** A kid's on-board look: `skinTone`, `hairStyle`, `hairColor`, `shirtColor`,
`pantsColor`, `accessory`, `eyeShape`, `eyeColor`, `mouthShape`, `top`, `bottom`,
`onePiece`, `graphic`. Each field is one of a
fixed, protocol-defined list of values — not any string or color. A guest sends
`appearanceSet` to set their own look for the current connection. A logged-in session's
`appearanceSet` also saves the look to the account.

The three face fields are optional on the wire and default to `eyeShape: "round"`,
`eyeColor` Dark Brown (`FREE_EYE_COLORS[0]`), and `mouthShape: "smile"`. A look saved
before the face fields existed parses with those defaults.

The four clothing fields are optional on the wire too, and default to `top: "tee"`,
`bottom: "pants"`, `onePiece: "none"`, and `graphic: "star"`. A look saved before v5 parses
as a tee, pants, no one-piece, and the star graphic.

| Field | Free values | Shop values |
|---|---|---|
| `top` | `tee`, `buttonUp`, `graphicTee`, `hoodie` | `catEarHoodie` |
| `bottom` | `pants`, `shorts`, `skirt` | none |
| `onePiece` | `none`, `dress`, `overalls` | `sparklyDress` |
| `graphic` | `star`, `pizza`, `lightning`, `planet` | `rubberDuck`, `dinosaur`, `taco`, `rainbow` |

How the pieces combine is drawing only: a dress (plain or sparkly) replaces the top and the
bottom, overalls replace the bottom and sit over the top, and the graphic shows only on a
visible `graphicTee`. Every field is still stored and checked on its own, so a saved look
can hold a graphic under a hoodie, and ownership still applies to that hidden graphic.

`skinTone` is one of ten free tones, light to dark (`SKIN_TONES`): `#f6d7bf`, `#eec19b`,
`#e2b087`, `#d9a47a`, `#c68b5e`, `#b87a4f`, `#9f6641`, `#8d5634`, `#5e3a24`, `#3f2618`. The
six tones from before v5 keep their values.

Some option values are shop items (see Lunch Money and the shop below). The `FREE_*` lists
in `@eat.io/protocol` hold the values anyone may wear. `appearanceSet` with a shop value the
player does not own answers `accountError` `NOT_OWNED`. A guest owns nothing, so any shop
value is refused. On `accountLogout` the session keeps its look with each shop value swapped
for that field's first free value, and a room only ever captures a look the player may wear.

**`Profile`.** `username`, `role` (`player` | `admin` | `creator`), `permissions` (the array
for that role), `appearance` (nullable), `pointsScored`, `gamesPlayed`, `gamesWon`,
`lunchMoney`, `ownedItems` (shop item ids), `createdAt`, `lastLoginAt` (nullable). Sent in
`accountLoggedIn` and `profile`.

**Permissions.** `admin.open`, `settings.edit`, `deck.edit`, `shop.edit`. `player` gets
none. `admin` gets `admin.open` and `settings.edit`. `creator` gets all four. The server
checks the relevant permission on every settings/deck/shop config request and save,
answering `adminError` `FORBIDDEN` if it is missing.

**Account error codes.** `accountError.code` is one of: `INVALID_USERNAME`,
`INVALID_PASSWORD`, `USERNAME_TAKEN`, `BAD_CREDENTIALS`, `WRONG_PASSWORD`, `RATE_LIMITED`,
`NOT_LOGGED_IN`, `BUSY`, `NOT_OWNED`, `NOT_AVAILABLE`, `ALREADY_OWNED`, `NOT_ENOUGH`.
`BAD_CREDENTIALS` never says which of username or password was wrong. `NOT_OWNED` answers an
`appearanceSet` that uses an unowned shop item. The last three answer `shopBuy`.

**Login and resume.** A successful `accountRegister` or `accountLogin` answers
`accountLoggedIn` with the profile and a fresh `loginToken`. Store that token and send it as
`hello.loginToken` on a later connection to resume the account:

- A valid `loginToken` on `hello`: the server answers `welcome`, then `accountLoggedIn` with
  the profile and no `loginToken` (the existing token is still good).
- An unknown or expired `loginToken` on `hello`: the server answers `welcome`, then
  `accountLoggedOut` with `reason: "expired"`, and the session continues as a guest.

## Game settings and the deck

Admins and Creators edit two things in-game: the game settings and the default deck. Both
live in `@eat.io/protocol` as shared limits, so the server and the client read the same
numbers.

**`GameSettings`.** `roundCount`, `turnSeconds`, `handSize`, all whole numbers. Sent inside
`settings`.

**`DeckCard`** (inside `deck.cards`). The card view fields without `instanceId` — `id`,
`name`, `action`, `amount`, `targets`, `turns?` — plus `copies`, the count of that card in
the deck. `deck.cards` lists **every** catalog card, including ones with `copies: 0`.

**Limits.** A save outside these ranges is refused with `adminError` `INVALID_SETTINGS` or
`INVALID_DECK` naming the broken limit — never a generic `error`.

| Value | Range |
|---|---|
| `roundCount` | 1–30 |
| `turnSeconds` | 5–120 |
| `handSize` | 3–8 |
| Copies of one card | 0–40 |
| Deck total (`deckSave.cards` copies summed) | 10–100 |

**`deckSave` validation** also rejects a card id absent from the catalog and a card id
repeated more than once in `cards`.

**`AdminErrorCode` values.** `FORBIDDEN` (missing permission), `INVALID_SETTINGS`,
`INVALID_DECK`, `INVALID_SHOP` (a bad `shopConfigSave`).

A player mid-queue or mid-game can still save settings or the deck — a save only affects
future games, never the one in progress (each room reads settings and the deck once, at
start, and keeps them for its whole life).

## Lunch Money and the shop

**Lunch Money.** A logged-in player earns 1 Lunch Money for each food eaten in a finished
game (the same count as points scored). Guests earn nothing. Each logged-in player gets
their updated `profile` at game over, as before; the difference in `lunchMoney` is what they
earned.

**Shop items.** The catalog is `SHOP_ITEMS` in `@eat.io/protocol`. Each item has an `id`, a
`name`, a `kind`, the appearance value it unlocks, and a default price. The Creator's saved
price and availability override the defaults.

| Kind | Appearance field | Item ids |
|---|---|---|
| `extra` | `accessory` | `extra.sunglasses`, `extra.bowTie`, `extra.headphones`, `extra.chefHat`, `extra.crown`, `extra.propellerCap`, `extra.trafficCone`, `extra.vikingHelmet`, `extra.alienAntennae`, `extra.bananaHat` |
| `shirtColor` | `shirtColor` | `shirt.gold`, `shirt.neonLime`, `shirt.midnight` |
| `hairColor` | `hairColor` | `hair.electricBlue`, `hair.bubblegum`, `hair.silver` |
| `eyeShape` | `eyeShape` | `eyes.star`, `eyes.heart` |
| `eyeColor` | `eyeColor` | `eyeColor.violet`, `eyeColor.gold` |
| `mouthShape` | `mouthShape` | `mouth.tongue`, `mouth.fangs` |
| `top` | `top` | `top.catEarHoodie` |
| `onePiece` | `onePiece` | `onePiece.sparklyDress` |
| `graphic` | `graphic` | `graphic.rubberDuck`, `graphic.dinosaur`, `graphic.taco`, `graphic.rainbow` |

**`ShopItem`** (inside `shop.items` and `shopConfig.items`). `id`, `name`, `kind`, `price`
(the current price), `available`, and `owned` (whether the receiving account owns it).

**Buying.** One server transaction. The server checks that you are logged in, the item is
available, you do not own it, and you can afford it. It then deducts the price and records
the item as yours. Nothing is refunded or sold back.

**Saving the shop config.** Each listed item's price and availability are saved together;
an item left out of `shopConfigSave.items` keeps what it had. An item never saved uses its
default price and is available.

**Turning an item off.** An unavailable item cannot be bought. Players who already own it
keep it and can still wear it.

**Price limits.** Each price is a whole number from 1 to 1000 (`SHOP_PRICE_LIMITS`).

## Practice games

`practiceStart` puts the player in seat `a` of a new room against the server's bot in seat
`b`. Every `roomState` for that room carries `mode: "practice"`. The bot is an ordinary
`opponent` in the view, named "Sam", with a free look. It sees only its own view, the same
payload a human gets.

A practice game uses fixed rules, whatever the saved game settings and deck are: 6 rounds,
hand size 5, and no turn clock, so `deadlineAt` is `null` for the whole game. It ends with
the normal `gameOver`, but it changes no stats and pays no Lunch Money. `roomLeave` ends it
at once. The bot never disconnects, so a practice game never sends
`opponentDisconnected`. If the player disconnects, the normal reconnect grace applies.

## Typical sequences

**Matchmake and play a round**

```
C→S hello {protocolVersion:5, name:"Riley"}
S→C welcome {playerId, sessionToken}
C→S queueJoin
S→C queueWaiting                     (until an opponent arrives)
S→C roomState {phase:"in-progress", deadlineAt, you, opponent}
C→S submitTurn {cardInstanceId, targetTrayIds}
S→C actionAccepted
S→C roomState (you.submitted:true)
   ... when both have submitted, the round resolves ...
S→C roomState (roundIndex incremented, new deadlineAt)
```

**Resume a logged-in account**

```
C→S hello {protocolVersion:5, name:"Riley", loginToken:<stored token>}
S→C welcome {playerId, sessionToken}
S→C accountLoggedIn {profile}                (no loginToken: the stored one is still good)
```

```
C→S hello {protocolVersion:5, name:"Riley", loginToken:<unknown or expired>}
S→C welcome {playerId, sessionToken}
S→C accountLoggedOut {reason:"expired"}       session continues as a guest
```

**Buy and wear a shop item**

```
C→S shopRequest
S→C shop {items, balance:140}
C→S shopBuy {itemId:"extra.crown"}
S→C shop {items (crown owned:true), balance:40}
S→C profile {profile (ownedItems includes "extra.crown")}
C→S appearanceSet {appearance (accessory:"crown")}
```

**Disconnect and reconnect**

```
(socket drops — either the TCP connection closes, or the server's
 ping goes unanswered for HEARTBEAT_TIMEOUT_MS and the socket is dropped)
S→C(opponent) opponentDisconnected {graceEndsAt}     room is now paused
(within grace, dropped client opens a new socket)
C→S hello {protocolVersion:5, name:"Riley", sessionToken:<same token>}
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
