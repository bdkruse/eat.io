import type { Seat } from "@eat.io/protocol";
import { makeRng, type Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import { CARD_CATALOG } from "./rules/content.js";
import type { Card, CardDefinition, GameState, PlayerId, PlayerState, Tray } from "./state.js";

export interface CreateGameOptions {
  roomId: string;
  seats: { id: PlayerId; seat: Seat; name: string }[];
  rules: Rules;
  roundCount: number;
  seed: number;
  /** Catalog card ids, in hand order. Each takes one matching copy out of that player's
   *  built deck (the first copy found), or is stamped from the catalog when the deck has
   *  none. The hand is exactly those cards; the deck is what is left. */
  openingHands?: Partial<Record<PlayerId, readonly string[]>>;
}

function catalogCard(cardId: string): CardDefinition {
  const definition = CARD_CATALOG.find((card) => card.id === cardId);
  if (!definition) throw new Error(`createGame: unknown opening card ${cardId}`);
  return definition;
}

export function createGame(opts: CreateGameOptions): GameState {
  const { rules } = opts;
  let rng: Rng = makeRng(opts.seed);
  let nextTrayId = 0;
  let nextCardId = 0;
  const players: Record<PlayerId, PlayerState> = {};

  // A bad opening hand throws before anything is dealt.
  for (const openingHand of Object.values(opts.openingHands ?? {})) {
    if (!openingHand) continue;
    if (openingHand.length > rules.config.handSize) {
      throw new Error(`createGame: opening hand of ${openingHand.length} exceeds hand size ${rules.config.handSize}`);
    }
    openingHand.forEach(catalogCard);
  }

  /** One dealt copy: the catalog definition plus an id unique within this game. */
  const stamp = (definitions: readonly { id: string }[]): Card[] =>
    definitions.map((definition) => ({
      ...(definition as Card),
      instanceId: String(nextCardId++),
    }));

  for (const seat of opts.seats) {
    const [definitions, afterDeck] = rules.buildDeck(rng);
    rng = afterDeck;
    const deck = stamp(definitions);
    const openingHand = opts.openingHands?.[seat.id];
    const hand = openingHand
      ? openingHand.map((cardId) => {
          const deckIndex = deck.findIndex((card) => card.id === cardId);
          if (deckIndex >= 0) return deck.splice(deckIndex, 1)[0]!;
          return stamp([catalogCard(cardId)])[0]!;
        })
      : deck.splice(0, rules.config.handSize); // remove dealt cards from the pile

    const table: Tray[] = [];
    for (let i = 0; i < rules.config.tableLength; i++) {
      const [value, afterVal] = rules.freshTrayValue(rng);
      rng = afterVal;
      table.push({ id: String(nextTrayId++), value });
    }

    players[seat.id] = {
      id: seat.id,
      seat: seat.seat,
      name: seat.name,
      connected: true,
      table,
      hand,
      deck,
      score: 0,
      submission: null,
      extraServings: [],
    };
  }

  return {
    roomId: opts.roomId,
    phase: "in-progress",
    roundIndex: 0,
    roundCount: opts.roundCount,
    players,
    rng,
    nextTrayId,
    nextCardId,
  };
}
