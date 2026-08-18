import type { CardAction } from "@eat.io/protocol";
import type { Card, Tray } from "../state.js";
import { type Rng, nextInt, shuffle } from "../../util/rng.js";
import { CARD_CATALOG, TUNING } from "./content.js";

export interface RulesConfig {
  tableLength: number;
  handSize: number;
  roundCount: number;
  trayMin: number;
  trayMax: number;
  deckSize: number;
}

export interface Rules {
  readonly cards: readonly Card[];
  readonly config: RulesConfig;
  buildDeck(rng: Rng): [Card[], Rng];
  freshTrayValue(rng: Rng): [number, Rng];
  applyEffect(tray: Tray, card: Card): Tray;
}

// Effect dispatch over data — a new action is a new entry, not a new branch.
const EFFECTS: Record<CardAction, (value: number, amount: number) => number> = {
  add: (value, amount) => value + amount,
  multiply: (value, amount) => value * amount,
};

export const defaultRules: Rules = {
  cards: CARD_CATALOG,
  config: { ...TUNING },

  buildDeck(rng) {
    const pool: Card[] = [];
    for (let i = 0; i < TUNING.deckSize; i++) {
      pool.push(CARD_CATALOG[i % CARD_CATALOG.length]!);
    }
    return shuffle(rng, pool);
  },

  freshTrayValue(rng) {
    const span = TUNING.trayMax - TUNING.trayMin + 1;
    const [n, next] = nextInt(rng, span);
    return [TUNING.trayMin + n, next];
  },

  applyEffect(tray, card) {
    const fn = EFFECTS[card.action];
    return { ...tray, value: fn(tray.value, card.amount) };
  },
};
