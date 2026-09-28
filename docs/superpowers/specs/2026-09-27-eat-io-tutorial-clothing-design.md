# eat.io Tutorial, Clothing, and a Varied Crowd: Design Spec

**Date:** 2026-09-27
**Scope:** A guided practice game against a server bot. Clothing chosen by body part.
The cafeteria crowd wears the new clothing and shop items, with an even spread of skin
tones. Protocol version 4 becomes 5.

---

## 1. Intent

The owner wants two things in one batch:

1. **A tutorial.** A new player learns the game by playing a short practice game against
   a computer opponent at the real table. Prompts point at each part of the table and at
   each card type as it comes up.
2. **Clothing and a varied crowd.** A player picks a top and a bottom separately, or one
   full-body piece such as a dress. The crowd in the cafeteria wears the new clothing and
   many shop items, and shows a wide, even range of skin tones.

Success: a first-time guest sees the "How to play" hint, plays the practice game to the
end, and finishes knowing what each card type does. A player dresses their kid in a
hoodie and a skirt, or a dress, and the opponent sees it at the table. The crowd shows
every skin tone and every clothing type.

## 2. Decisions (owner-approved)

| Question | Decision |
|---|---|
| Who plays the tutorial | Everyone, guests and accounts |
| Rewards | None. No stats and no Lunch Money |
| How it starts | A "How to play" button on the menu, plus a hint on the first visit |
| Pacing | 6 rounds, no turn clock, a scripted opening hand, then a normal deal |
| Bot strength | Gentle: about half its moves are the best move, the rest random legal moves |
| Lower and full-body pieces | Pants, shorts, skirt. Dress and overalls |
| Free or shop | Every basic type is free. The shop sells special versions |
| Graphic T | The player picks a graphic. Some are free, some are in the shop |
| Colors | The shirt color colors any top and the dress. The pants color colors any bottom and the overalls |
| Skin tones | Grow from 6 to 10, all free. The crowd gets them in even turns |
| Crowd and the shop | Most of the crowd wears shop items |

## 3. Constraints carried over

- The engine stays pure. No sockets, no timers, no `Date` or `Math.random`. The clock and
  the RNG are injected. A whole practice game must be playable in a test with no server.
- No module-level mutable game state. The practice room and its bot hang off the room
  instance.
- Per-player logic runs over the players collection, never `playerOne`/`playerTwo`.
- Hidden information is absent from payloads. The bot sees only its own `viewFor` view,
  like a human player.
- The client never computes game state. Tutorial prompts read the view and the client's
  own selection. They never decide a game outcome.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never
  "plate".
- Everything free today stays free. Guests cannot own or wear shop items.
- An appearance stored before this batch must still parse.
- Commits use the noreply email. No attribution lines.

## 4. The practice game (server)

### 4.1 Starting it

A new client message `practiceStart` asks for a practice game. The server answers with
the usual `roomState` messages. A player who is already in a room or in the queue gets
the existing error for that case.

The server creates a practice room with the player in seat `a` and the bot in seat `b`.
The practice room never touches matchmaking or private-room codes.

### 4.2 Fixed rules

A practice game uses fixed rules, so the tutorial is the same whatever the Admin or the
Creator changed:

- 6 rounds.
- No turn clock. `roomState.deadlineAt` is `null` for the whole game, and no move
  deadline is armed.
- Hand size 5 and the normal table length.
- The code's `STARTING_DECK`, not the Creator's saved deck.

### 4.3 The scripted opening hand

`createGame` gains an optional opening hand per player, given as catalog card ids. For
the human player the opening hand is, in this order:

1. `add3` (Add Three Food To One Tray)
2. `double1` (Double Food On One Tray)
3. `addAll1` (Add One Food To Every Tray)
4. `servings2x2` (Extra Servings, +2 for 2 turns)
5. `add1x2` (Add One Food To Two Trays)

The plan uses the real catalog ids. The names above identify the cards. The dealt
opening cards come out of that player's built deck where the deck holds a copy. Any
missing copy is stamped from the catalog. Draws after the opening hand come from the
rest of the deck as normal. The bot gets a normal random hand.

### 4.4 No rewards

A practice room never calls `onResult`. It writes no stats and no Lunch Money for anyone.
The game still ends with the normal `gameOver` message.

### 4.5 The bot

- **Identity.** A synthetic player id that no real connection can have. Its name is
  "Sam", with a fixed free look, and it never disconnects.
- **Moves.** A pure function chooses a move from the bot's own view and an injected RNG.
  It builds the legal moves, one per card in the hand. A card with targets aims at the
  front trays, and a card with no targets needs no trays. With probability one half it
  plays the move that gives the front tray the highest value. Otherwise it plays a
  uniformly random legal move. Every chosen move passes `validateAction`.
- **Timing.** When a round starts and the bot has not submitted, the room schedules the
  bot's move about 1000 ms later through the injected timers. At the end of the room, the
  room cancels that timer.
- **Seeding.** The bot's RNG is seeded per room, so a test with a fixed seed plays the
  same game every time.

### 4.6 Leaving and disconnects

- `roomLeave` ends a practice game at once. The room is removed with no result.
- If the human disconnects, the normal reconnect grace applies. After the grace, the room
  ends quietly with no result. A reconnect inside the grace resumes the game.
- The bot never triggers `opponentDisconnected`.

## 5. The tutorial (client)

### 5.1 Entry

- The menu gains a "How to play" button. It sends `practiceStart`.
- On a first visit, a small hint points at that button. After the player presses
  "How to play" or dismisses the hint, it closes. The browser stores that the hint was
  shown (`localStorage`, every read and write in try/catch). If storage fails, the hint
  shows again next visit, and nothing else breaks.

### 5.2 Prompts

A pure function gives the current prompt: its text, what it points at, and what moves
it on. Its input is the tutorial state: the room view, the round, the player's current
selection, and the steps that are done. The prompt shows in a callout on screen. A matching highlight marks
its target: a card in the hand, the trays, the eater, the End turn button, or the Extra
Servings marker.

| Round | Prompts, in order | Next step after |
|---|---|---|
| 1 | Welcome. This is your side of the table | Next |
| 1 | These are your trays. Food moves toward the eater at the head of the table | Next |
| 1 | At the end of each round, the eater eats your front tray. Its food becomes your points | Next |
| 1 | Pick the +3 card | A card is selected |
| 1 | Tap a tray to put the food on it. The front tray is eaten next | The card's targets are chosen |
| 1 | Press End turn | The turn is submitted |
| 1 | Sam plays too. Watch your front tray get eaten | The round resolves |
| 2 | ×2 doubles the food on one tray. Try it on a tray with lots of food | Select, target, submit |
| 3 | +1 all adds one food to every tray on your side. It needs no tray | Select, submit |
| 4 | Extra Servings adds 2 food to each of the next 2 trays that arrive. Watch the marker at the end of your table | Select, submit |
| 5 | You are on your own now. Play any card | Submit |
| 6 | No prompt | |

- A suggestion never forces a card. If the player picks another card, the step still
  moves on, and the next round suggests its own card.
- If the suggested card is no longer in the hand, the prompt says "Play any card".
- A "Skip" button stays on screen for the whole practice game. It sends `roomLeave` and
  returns to the menu.
- The practice game shows no turn clock.

### 5.3 The end

The game over panel for a practice game says "You are ready!" with the score. It offers
"Find a game" (joins the queue) and "Back to menu". It shows no Lunch Money line.

## 6. Clothing

### 6.1 New appearance fields

| Field | Free values | Shop values (default price) |
|---|---|---|
| `top` | `tee`, `buttonUp`, `graphicTee`, `hoodie` | `catEarHoodie` (60) |
| `bottom` | `pants`, `shorts`, `skirt` | none |
| `onePiece` | `none`, `dress`, `overalls` | `sparklyDress` (80) |
| `graphic` | `star`, `pizza`, `lightning`, `planet` | `rubberDuck` (30), `dinosaur` (40), `taco` (30), `rainbow` (50) |

A stored look with no value for a field gets the default: `tee`, `pants`, `none`,
`star`. A look stored before this batch parses as a T-shirt, pants, no one-piece, and the
star graphic.

### 6.2 How the pieces combine

- A dress, plain or sparkly, replaces the top and the bottom. It uses the shirt color.
- Overalls replace the bottom and are worn over the top. They use the pants color.
- The graphic shows only on a graphic T that is visible, so not under a dress.
- The top uses the shirt color and the bottom uses the pants color, as today.
- Every field is stored and checked on its own. A saved look can hold a graphic with a
  hoodie top. Ownership rules still apply to that hidden graphic.

### 6.3 Skin tones

The list grows from 6 to 10, all free, ordered light to dark. The existing six keep their values, so every stored look still parses.

| Tones 1–5 | Tones 6–10 |
|---|---|
| `#f6d7bf` | `#b87a4f` |
| `#eec19b` | `#9f6641` |
| `#e2b087` | `#8d5634` |
| `#d9a47a` | `#5e3a24` |
| `#c68b5e` | `#3f2618` |

### 6.4 Shop items

Six new items join the shop, with prices the Creator can edit and availability the
Creator can switch, like the existing items. The item ids are `top.catEarHoodie`,
`onePiece.sparklyDress`, `graphic.rubberDuck`, `graphic.dinosaur`, `graphic.taco`, and
`graphic.rainbow`. A missing `shop_items` row means the code default, so no migration is
needed.

### 6.5 Customize

- New rows: Top, Graphic (shown only while the top is a graphic T), Bottom, and One-piece.
- "Shirt" becomes "Top color", and "Pants" becomes "Bottom color".
- While a dress is picked, the Top and Bottom rows are disabled, with a short note.
- Shop values show as locked rows with prices, as today, and open the shop.
- "Surprise me" also picks from the new fields, using only values that the player owns or that are free.

### 6.6 The kid model

The kid model draws each top, bottom, and one-piece with the existing toon materials and
simple shapes:

- The button-up shows buttons and a collar.
- The hoodie shows a hood, a front pocket, and strings.
- The cat-ear hoodie is the hoodie with cat ears on the hood.
- The shorts and the skirt show the legs below them.
- The dress flares below the waist, and the sparkly dress adds a glitter pattern.
- The overalls show a bib and straps.
- Each graphic is a small, readable design on the chest.

All of it must work in the High and Low detail modes.

## 7. The crowd

- A pure, seeded function gives each crowd kid a look, so the crowd looks the same on
  every visit.
- **Skin tones.** The crowd gets all 10 tones in even turns. Within any 10 consecutive
  kids, every tone appears once. Across the whole crowd, no two tone counts differ by
  more than one.
- **Clothing.** Every top, bottom, and one-piece value appears in the crowd.
- **Shop items.** About three in four crowd kids wear at least one shop item from any
  field, drawn from the full shop list. The crowd never checks ownership, because it is
  scenery.
- This covers the walking crowd and the kids seated at the other tables.

## 8. Protocol version 5

- New client message `practiceStart`.
- `roomState` gains `mode`, which is `"match"` or `"practice"`.
- `Appearance` gains `top`, `bottom`, `onePiece`, and `graphic`, and `skinTone` gains four
  values.
- The shop gains the six new items.
- An old cached client gets the usual protocol mismatch message and reloads.

## 9. Testing

- **Engine.** A full practice game plays in a test with no server: a scripted opening
  hand, the bot's moves, and 6 rounds. The bot's chosen move always passes
  `validateAction`. With a fixed seed, the bot plays the same moves every time.
- **Room.** A practice game has no deadline, sends `mode: "practice"`, never calls
  `onResult`, and ends on `roomLeave`. At the end of the room, the bot's timer is cancelled.
  After the reconnect grace, the room ends with no result.
- **Lobby.** `practiceStart` while queued or in a room is refused. A finished practice
  game changes no account's stats or Lunch Money.
- **Appearance.** Old stored looks parse with the new defaults. For a player who does not
  own them, ownership checks refuse the new shop values. The shop sells them.
- **Tutorial prompts.** The pure prompt function steps through every prompt in the
  table. It also handles a skipped suggestion and a missing suggested card.
- **Crowd.** The tone spread holds for any 10 consecutive kids and for the whole crowd.
  Every clothing value appears, and about three in four kids wear a shop item.
- **Browser (headless Chromium only, never the playwright-chrome MCP).** A guest plays
  the tutorial from the hint to "You are ready!". Screenshots show every clothing piece
  and the crowd.

## 10. Deployment

- No database migration. Appearances are stored as JSON, and missing shop rows use the
  code defaults.
- Deploy the server first, then push `main` so Pages rebuilds the site, the same order as
  before.
- Test the live site as a guest only.

## 11. Out of scope

- A choice of bot difficulty.
- A practice game against a friend.
- Tutorial progress saved to an account.
- Colors per clothing piece beyond the top color and the bottom color.
