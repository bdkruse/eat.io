import type { Seat } from "@eat.io/protocol";
import { makeRng, type Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import type { Card, GameState, PlayerId, PlayerState, Tray } from "./state.js";

export interface CreateGameOptions {
  roomId: string;
  seats: { id: PlayerId; seat: Seat; name: string }[];
  rules: Rules;
  roundCount: number;
  seed: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  const { rules } = opts;
  let rng: Rng = makeRng(opts.seed);
  let nextTrayId = 0;
  let nextCardId = 0;
  const players: Record<PlayerId, PlayerState> = {};

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
    const hand = deck.splice(0, rules.config.handSize); // remove dealt cards from the pile

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
