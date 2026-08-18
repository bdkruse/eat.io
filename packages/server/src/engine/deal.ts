import type { Seat } from "@eat.io/protocol";
import { makeRng, type Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import type { GameState, PlayerId, PlayerState, Tray } from "./state.js";

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
  const players: Record<PlayerId, PlayerState> = {};

  for (const seat of opts.seats) {
    const [deck, afterDeck] = rules.buildDeck(rng);
    rng = afterDeck;
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
  };
}
