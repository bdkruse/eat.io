import type { CardAction } from "@eat.io/protocol";
import type { CardDefinition, Tray } from "../state.js";
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
  readonly cards: readonly CardDefinition[];
  readonly config: RulesConfig;
  /** Returns definitions; the engine stamps instance ids as it deals and draws. */
  buildDeck(rng: Rng): [CardDefinition[], Rng];
  freshTrayValue(rng: Rng): [number, Rng];
  applyEffect(tray: Tray, card: CardDefinition): Tray;
}

// Effect dispatch over data — a new action is a new entry, not a new branch.
const EFFECTS: Record<CardAction, (value: number, amount: number) => number> = {
  add: (value, amount) => value + amount,
  multiply: (value, amount) => value * amount,
};

/**
 * Builds a rules instance from the provisional content, with any tuning value
 * overridden. The composition root passes the env-backed config through here so
 * `TABLE_LENGTH` / `HAND_SIZE` reach the game while the owner iterates (§0.9).
 */
export function makeRules(overrides: Partial<RulesConfig> = {}): Rules {
  const config: RulesConfig = { ...TUNING, ...overrides };

  return {
    cards: CARD_CATALOG,
    config,

    buildDeck(rng) {
      const pool: CardDefinition[] = [];
      for (let i = 0; i < config.deckSize; i++) {
        pool.push(CARD_CATALOG[i % CARD_CATALOG.length]!);
      }
      return shuffle(rng, pool);
    },

    freshTrayValue(rng) {
      const span = config.trayMax - config.trayMin + 1;
      const [n, next] = nextInt(rng, span);
      return [config.trayMin + n, next];
    },

    applyEffect(tray, card) {
      const fn = EFFECTS[card.action];
      return { ...tray, value: fn(tray.value, card.amount) };
    },
  };
}

export const defaultRules: Rules = makeRules();
