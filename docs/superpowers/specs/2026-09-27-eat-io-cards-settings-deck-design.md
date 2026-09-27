# eat.io New Cards, Admin Settings, and Creator Deck Editor: Design Spec

**Date:** 2026-09-27
**Scope:** Two new cards and the "extra servings" mechanic. Game settings move into the
database with an admin panel. A creator panel gets a deck editor for the default deck.
Protocol version 3 becomes 4.

---

## 1. Intent

The owner wants three things, built in this order:

1. **New cards.** "Add One Food To Every Tray" adds 1 to every tray on your own table.
   "Extra Servings" makes the next trays that arrive at your table come with extra food.
   Each goes into the default deck once, and the deck loses two copies of "Add One Food
   To One Tray".
2. **An admin panel.** Admins and the Creator change the round count, the turn clock, and
   the hand size from inside the game. A change applies to the next game, with no
   restart.
3. **A creator panel.** Its first tool is a deck editor. The Creator picks how many
   copies of each card the default deck holds. That deck is the one every game uses.

Success: the Creator opens the deck editor, sets the quantities, and saves. An Admin
changes the round count. The next game uses both changes, and a game already in progress
keeps the values it started with.

## 2. Decisions (owner-approved)

| Question | Decision |
|---|---|
| "+1 to all trays": whose trays | Your own five trays only |
| Extra servings: first boosted tray | The next tray to arrive, which is the one at the end of the round the card is played |
| Two servings cards at once | They add up |
| Who edits settings | Admin and Creator |
| Settings and ranges | Round count 1–30, turn clock 5–120 seconds, hand size 3–8 |
| Who edits the deck | Creator only |
| Deck editor scope | Copies per card only. New card types are still defined in code |

## 3. Constraints carried over

- The engine stays pure. It receives the settings and the deck as plain data. It never
  reads the database.
- Adding a card is a data entry plus, for a new action, one rule function. It is never
  surgery on the turn loop.
- There is no module-level mutable state, and time comes from the injected clock.
- The client computes no game state.
- Vocabulary: table, tray, eaten, card, hand, deck, round, room, seat, opponent. Never
  "plate."

## 4. Cards

### 4.1 Card shape

Each card definition gains two things:

- **Actions:** `action` gains two values, `addAll` and `extraServings`, beside the
  existing `add` and `multiply`.
- **`turns`:** a positive whole number, present only on `extraServings`. It is the
  number of arriving trays the card boosts.

`targets` can now be `0`, for a card that needs no tray choice. The engine keeps two
kinds of effect, both dispatched from data:

- **Tray effects** (`add`, `multiply`) change each chosen tray, as today.
- **Table effects** (`addAll`, `extraServings`) take no tray choice. They change the
  player's own table or its upcoming trays.

### 4.2 The two new cards

| id | Name | action | amount | targets | turns |
|---|---|---|---|---|---|
| `addAll1` | Add One Food To Every Tray | `addAll` | 1 | 0 | none |
| `servings2x2` | Extra Servings | `extraServings` | 2 | 0 | 2 |

### 4.3 Extra servings

Each player has a list of upcoming bonuses, `extraServings: number[]`. Index 0 is the
bonus for the next tray to arrive at that player's table. A round resolves like this:

1. **The played card's effect.** An `extraServings` card adds `amount` to each of the
   next `turns` entries in the list. It extends the list with zeros first where needed.
   So two cards add up.
2. **The front tray is eaten,** as today.
3. **A fresh tray arrives.** Its value is the random value plus the first list entry.
   That entry is then removed. An empty list adds nothing.

A card played this round therefore boosts the tray that arrives at the end of this round,
and the next `turns − 1` trays after it.

Example: a player with no servings plays Extra Servings (2 for 2 turns). The list becomes
[2, 2]. At the end of the round the fresh tray gets +2, and the list is [2]. Next round
the player plays another Extra Servings. The list becomes [4, 2], so the next tray gets
+4, then [2], so the tray after that gets +2.

The list is public. Both players can see each other's upcoming bonuses.

### 4.4 Deck and validation

- **Target count:** for a card with `targets: 0`, `submitTurn` must send an empty
  `targetTrayIds`. The existing `WRONG_TARGET_COUNT` check covers this unchanged.
- **Auto move:** the timed-out auto move still discards a random card. A discarded card
  has no effect, whatever its action.

## 5. Settings and deck storage

Migration 2 adds two tables.

**`game_settings`** is one row, `id = 1`:

| Column | Type |
|---|---|
| `round_count` | integer |
| `turn_seconds` | integer |
| `hand_size` | integer |
| `updated_at` | integer, nullable |
| `updated_by` | integer, nullable, references `accounts(id)` |

It is seeded from the startup values: `ROUND_COUNT` (20), `MOVE_DEADLINE_MS` (20000) in
seconds, and `HAND_SIZE` (5).

**`default_deck`**:

| Column | Type |
|---|---|
| `card_id` | text primary key |
| `copies` | integer, 0–40 |

A separate one-row `default_deck_meta` table holds `updated_at` and `updated_by`.

The deck table is seeded with the starting deck, 40 cards:

| Card | Copies |
|---|---|
| Add One Food To One Tray | 5 |
| Add One Food To Two Trays | 7 |
| Add Three Food To One Tray | 7 |
| Double Food On One Tray | 7 |
| Double Food On Two Trays | 6 |
| Triple Food On One Tray | 6 |
| Add One Food To Every Tray | 1 |
| Extra Servings | 1 |

A catalog card missing from the table counts as 0 copies. A table row for a card that no
longer exists in the catalog is ignored.

**At the start of each room,** the lobby reads the settings and the deck. The room builds
its own rules from them. The room keeps those values for its whole life, so a later save
never changes a game in progress. When the deck runs out mid-game, it is rebuilt from the
same composition, as today.

## 6. Permissions

`PERMISSIONS` becomes `["admin.open", "settings.edit", "deck.edit"]`.

- **Admin:** `admin.open` and `settings.edit`.
- **Creator:** every permission, as before.
- **Player:** none.

The server checks the permission on every request and save.

## 7. Limits

| Value | Range |
|---|---|
| Round count | 1–30, whole number |
| Turn clock | 5–120 seconds, whole number |
| Hand size | 3–8, whole number |
| Copies of one card | 0–40, whole number |
| Deck total | 10–100 |

The limits live in `@eat.io/protocol`, so the server enforces them and the panels show
them from the same source. A save outside a range is refused with a message that names
the limit.

## 8. Protocol version 4

The card changes break older clients, so the version goes from 3 to 4.

**Changed shapes:**

- **`CardView`:** `action` gains `addAll` and `extraServings`. `targets` can be 0.
  `turns` is optional.
- **`roomState`:** `you` and `opponent` each gain `extraServings: number[]`.

**New client messages:**

| Message | Fields |
|---|---|
| `settingsRequest` | none |
| `settingsSave` | `roundCount`, `turnSeconds`, `handSize` |
| `deckRequest` | none |
| `deckSave` | `cards: { cardId, copies }[]` |

**New server messages:**

| Message | Fields |
|---|---|
| `settings` | `settings` (the three values), `updatedAt`, `updatedBy` (username or null) |
| `deck` | `cards` (every catalog card with its copies), `total`, `updatedAt`, `updatedBy` |
| `adminError` | `code` (`FORBIDDEN`, `INVALID_SETTINGS`, `INVALID_DECK`), `message` |

A successful save answers with the fresh `settings` or `deck`. A player in a queue or a game
can still save, because a save affects only future games.

## 9. Client

**Cards in the hand**

- **Glyphs:** `addAll` shows "+1 all", and `extraServings` shows "+2 ×2".
- **Target count:** for a card with `targets` of 0, the tray count line reads "no trays".
- **Choosing a card with no targets:** it makes End turn ready at once. The status pill
  shows its existing ready text.
- **Keyboard:** the keyboard shortcuts work the same.

**On the table**

- **Upcoming extra servings:** a small marker at the foot of each player's table shows
  them, for example "+2, +2". It shrinks as the trays arrive.
- **A boosted tray:** it shows a brief highlight as it slides on.

**Admin panel**

- **Access:** an "Admin" button in the top bar opens it. Only a profile with
  `settings.edit` sees the button, and it is hidden during a game.
- **Contents:**
  - The three settings, each a number field with its range.
  - Save, and "Last changed by <name>, <date and time>".
  - Success and errors, shown the same way as on the profile panel.

**Creator panel**

- **Access:** a "Creator" button opens it. Only a profile with `deck.edit` sees the
  button, and it is hidden during a game.
- **Contents:** the first tool is the deck editor:
  - One row per catalog card, with its glyph, name, and target count.
  - A quantity with − and + buttons and a number field.
  - A live total with the 10–100 limit, and a Save button that is disabled outside the
    limits.
  - "Last changed by <name>, <date and time>".

**Panel behavior.** Profile, customize, admin, and creator never show at the same time.
Entering a room closes all of them. With the admin or creator panel open, the camera uses
the menu shot.

## 10. Testing

- **Protocol:**
  - The new messages.
  - `targets: 0`, and `turns` present only on servings.
  - `extraServings` required on the board.
  - The limit helpers.
- **Engine:**
  - `addAll` adds to every own tray and never the opponent's.
  - Servings boost the tray arriving that same round and the next.
  - Two servings cards add up.
  - The list runs out.
  - A discarded servings card does nothing.
  - A full game with every card type still plays to the end.
- **Rules:** building a deck from a composition gives exactly those counts. A missing card
  counts as 0.
- **Store:**
  - Migration 2 upgrades an existing version 1 database and leaves accounts intact.
  - Settings and deck round trip.
  - The starting deck adds up to 40.
- **Lobby:**
  - A Player or guest is refused both requests.
  - An Admin can save settings but not the deck. The Creator can save both.
  - Out-of-range values and unknown card ids are refused.
  - A save changes the next room's round count, turn clock, hand size, and deck.
  - A room in progress keeps its own values.
  - "Last changed by" is recorded.
- **Client:**
  - The reducer handles the new messages.
  - Selection with a 0-target card is ready at once.
  - The deck-total helper.
- **In the browser:**
  - Play both new cards against a local server.
  - As the Creator, change the deck and see it in the next game.
  - As an Admin, change the round count.

## 11. Deployment

This is a normal server deploy followed by a site push. Migration 2 runs on startup, adds
the two tables, and never touches accounts. It is not a reseed.

## 12. Out of scope

- Designing new card types in the editor.
- Per-room or per-player decks.
- More creator tools beyond the deck editor.
- A settings history.

---

## 13. Lunch Money and the shop (added 2026-09-27)

### 13.1 Decisions (owner-approved)

| Question | Decision |
|---|---|
| Name | Lunch Money, shown with a coin icon |
| Earning | 1 Lunch Money for each food a logged-in player eats in a finished game, the same count as points scored |
| Existing accounts | Start with Lunch Money equal to their points scored so far |
| Spending | A shop of new cosmetics. Everything in Customize today stays free |
| First items | New extras, new colors, and some silly or slightly outrageous items |
| Prices | 30–100 Lunch Money, set by the Creator in a creator shop tool, where items can also be turned off |
| Guests | They earn nothing and cannot buy |

### 13.2 Items

Items are defined in code as a catalog, like cards. Each has an id, a name, a kind, the
appearance value it unlocks, and a default price. The Creator's saved price and
availability override the defaults.

| id | Name | Kind | Default price |
|---|---|---|---|
| `extra.sunglasses` | Sunglasses | extra | 30 |
| `extra.bowTie` | Bow Tie | extra | 30 |
| `extra.headphones` | Headphones | extra | 40 |
| `extra.chefHat` | Chef Hat | extra | 50 |
| `extra.crown` | Crown | extra | 100 |
| `extra.propellerCap` | Propeller Cap, with a spinning propeller | extra (silly) | 60 |
| `extra.trafficCone` | Traffic Cone Hat | extra (silly) | 70 |
| `extra.vikingHelmet` | Viking Helmet | extra (silly) | 80 |
| `extra.alienAntennae` | Alien Antennae | extra (silly) | 60 |
| `extra.bananaHat` | Banana Hat | extra (silly) | 90 |
| `shirt.gold` | Gold Shirt | shirt color | 100 |
| `shirt.neonLime` | Neon Lime Shirt | shirt color | 40 |
| `shirt.midnight` | Midnight Shirt | shirt color | 30 |
| `hair.electricBlue` | Electric Blue Hair | hair color | 50 |
| `hair.bubblegum` | Bubblegum Pink Hair | hair color | 50 |
| `hair.silver` | Silver Hair | hair color | 40 |

Extras stay one slot, like today's accessory. The appearance option lists grow by these
values, and the kid model draws each new extra from primitives.

### 13.3 Face customization (added the same day)

Three new appearance options join Customize: eye shape, eye color, and mouth shape. Most
are free, and a few are shop items.

| Option | Free values | Shop values (price) |
|---|---|---|
| Eye shape | Round (default), Almond, Sleepy, Sparkly | Star Eyes (60), Heart Eyes (60) |
| Eye color | Dark Brown (default), Brown, Hazel, Green, Blue, Gray | Violet (40), Glowing Gold (80) |
| Mouth shape | Smile (default), Big Grin, Calm, Smirk | Tongue Out (50), Vampire Fangs (70) |

The shop ids follow the pattern above: `eyes.star`, `eyes.heart`, `eyeColor.violet`,
`eyeColor.gold`, `mouth.tongue`, `mouth.fangs`.

- **Eyes:** each eye shows its color with a dark pupil and a highlight. Blinking still
  works for every shape.
- **Mouth:** the mouth shape sets the resting mouth. The open mouth for talking and
  chomping stays as it is.
- **Stored looks:** a look saved before this change has no face fields. It reads with the
  defaults (Round, Dark Brown, Smile), so no saved appearance is lost. The protocol
  schema supplies these defaults.

### 13.4 Rules

- **The shop:** it shows every available item with its price, and marks the ones you
  own. Buy is disabled for an item you own, and for one that costs more than your
  balance.
- **Buying:** it is one server transaction. The server makes sure of four things: you are
  logged in, the item is available, you do not own it, and you can afford it. Then it deducts
  the price and records the item as yours. Nothing is refunded or sold back.
- **Customize:** shop values you own appear in the option rows with the free ones. Values
  you do not own show a lock and the price, and choosing one opens the shop at that item.
- **Ownership on `appearanceSet`:** the server refuses a look that uses an item the
  player does not own, with `accountError` `NOT_OWNED`. A guest cannot use shop items
  at all.
- **An item turned off by the Creator** leaves the shop. Players who own it keep it and
  can still wear it.
- **The Creator's shop tool:** one row per item with a price field (1–1000), an
  available switch, and Save. It uses a new permission, `shop.edit`, which only the
  Creator has.

### 13.5 Storage (migration 3)

- **`accounts`** gains `lunch_money INTEGER NOT NULL DEFAULT 0`, backfilled from
  `points_scored`.
- **`owned_items`** has `account_id` and `item_id`, with the pair as the primary key, and
  `purchased_at`.
- **`shop_items`** has `item_id` as the primary key, `price`, and `available`. A missing
  row means the item uses its code defaults.
- **Game end:** `recordGames` adds the score to `lunch_money` in the same transaction as
  the stats.

### 13.6 Protocol additions (still version 4)

- **`Profile`** gains `lunchMoney` and `ownedItems: string[]`.
- **Client messages:** `shopRequest`, `shopBuy { itemId }`, `shopConfigRequest`, and
  `shopConfigSave { items: { itemId, price, available }[] }`.
- **Server messages:** `shop { items, balance }` and `shopConfig { items, updatedAt,
  updatedBy }`. Each item carries `id, name, kind, price, available, owned`.
- **Errors:** a failed buy answers `accountError` with `NOT_LOGGED_IN`, `NOT_AVAILABLE`,
  `ALREADY_OWNED`, or `NOT_ENOUGH`. A creator error answers `adminError`.
- **Game over:** each logged-in player gets their updated `profile`, as today. The
  game-over screen shows "+N Lunch Money" from the difference.

### 13.7 Client

- **The top bar** shows the Lunch Money balance next to the profile button for a
  logged-in player.
- **The profile panel** shows the balance.
- **A "Shop" button** in the top bar opens a shop panel for a logged-in player. The camera
  shows your kid, and tapping an item previews it on your kid before you buy.
- **The game-over panel** shows the Lunch Money earned.
- **The creator panel** gains a second tab, Shop, next to the deck editor.

### 13.8 Testing

- **Store:**
  - The migration 3 backfill equals points scored.
  - A buy deducts once and records ownership.
  - A buy refuses an item already owned, an unaffordable one, and an unavailable one.
  - Two quick buys cannot overspend.
  - `recordGames` adds Lunch Money.
- **Lobby:**
  - Guests are refused.
  - `appearanceSet` with an unowned item is refused, and an owned item is accepted.
  - Turning an item off hides it from the shop but keeps it for its owners.
  - Only the Creator can save the shop config.
- **Protocol:** an appearance without the face fields parses with the defaults.
- **Client:** the reducer, and the locked and owned option rows.
- **In the browser:** earn Lunch Money in a game, buy an item, and wear it. The opponent
  sees it.
