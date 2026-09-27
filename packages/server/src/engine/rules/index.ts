import type { CardAction, DeckEntry } from "@eat.io/protocol";
import type { CardDefinition, Tray } from "../state.js";
import { type Rng, nextInt, shuffle } from "../../util/rng.js";
import { CARD_CATALOG, STARTING_DECK, TUNING } from "./content.js";

export interface RulesConfig {
  tableLength: number;
  handSize: number;
  roundCount: number;
  trayMin: number;
  trayMax: number;
  /** How many copies of each catalog card a deck holds. Cards not listed get 0. */
  deck: readonly DeckEntry[];
}

/** The part of a player a table effect reads and changes. */
export interface PlayerTable {
  table: Tray[];
  extraServings: number[];
}

export interface Rules {
  readonly cards: readonly CardDefinition[];
  readonly config: RulesConfig;
  /** Returns definitions; the engine stamps instance ids as it deals and draws. */
  buildDeck(rng: Rng): [CardDefinition[], Rng];
  freshTrayValue(rng: Rng): [number, Rng];
  /** A tray effect on one chosen tray. A table-effect card leaves the tray alone. */
  applyEffect(tray: Tray, card: CardDefinition): Tray;
  /** A table effect on the player's own table. A tray-effect card leaves it alone. */
  applyTableEffect(playerTable: PlayerTable, card: CardDefinition): PlayerTable;
}

type TrayAction = "add" | "multiply";
type TableAction = Exclude<CardAction, TrayAction>;

// Effect dispatch over data — a new action is a new entry, not a new branch.
const TRAY_EFFECTS: Record<TrayAction, (value: number, amount: number) => number> = {
  add: (value, amount) => value + amount,
  multiply: (value, amount) => value * amount,
};

const TABLE_EFFECTS: Record<TableAction, (playerTable: PlayerTable, card: CardDefinition) => PlayerTable> = {
  addAll: (playerTable, card) => ({
    ...playerTable,
    table: playerTable.table.map((tray) => ({ ...tray, value: tray.value + card.amount })),
  }),
  extraServings: (playerTable, card) => {
    const turns = card.turns ?? 0;
    const length = Math.max(playerTable.extraServings.length, turns);
    const extraServings = Array.from(
      { length },
      (_, index) => (playerTable.extraServings[index] ?? 0) + (index < turns ? card.amount : 0),
    );
    return { ...playerTable, extraServings: withoutTrailingZeros(extraServings) };
  },
};

function isTrayAction(action: CardAction): action is TrayAction {
  return Object.hasOwn(TRAY_EFFECTS, action);
}

/** The view only shows positive bonuses; a trailing 0 would be a bonus of nothing. */
function withoutTrailingZeros(values: number[]): number[] {
  let length = values.length;
  while (length > 0 && values[length - 1] === 0) length--;
  return values.slice(0, length);
}

/**
 * Builds a rules instance from the provisional content, with any tuning value
 * overridden. The composition root passes the env-backed config through here so
 * `TABLE_LENGTH` / `HAND_SIZE` reach the game while the owner iterates (§0.9).
 */
export function makeRules(overrides: Partial<RulesConfig> = {}): Rules {
  const config: RulesConfig = { ...TUNING, deck: STARTING_DECK, ...overrides };

  const copiesByCardId = new Map<string, number>();
  for (const entry of config.deck) {
    copiesByCardId.set(entry.cardId, (copiesByCardId.get(entry.cardId) ?? 0) + entry.copies);
  }

  return {
    cards: CARD_CATALOG,
    config,

    buildDeck(rng) {
      // Walks the catalog, so a composition entry naming no catalog card is ignored.
      const pool: CardDefinition[] = [];
      for (const definition of CARD_CATALOG) {
        const copies = copiesByCardId.get(definition.id) ?? 0;
        for (let copyIndex = 0; copyIndex < copies; copyIndex++) pool.push(definition);
      }
      return shuffle(rng, pool);
    },

    freshTrayValue(rng) {
      const span = config.trayMax - config.trayMin + 1;
      const [n, next] = nextInt(rng, span);
      return [config.trayMin + n, next];
    },

    applyEffect(tray, card) {
      if (!isTrayAction(card.action)) return tray;
      return { ...tray, value: TRAY_EFFECTS[card.action](tray.value, card.amount) };
    },

    applyTableEffect(playerTable, card) {
      if (isTrayAction(card.action)) return playerTable;
      return TABLE_EFFECTS[card.action](playerTable, card);
    },
  };
}

export const defaultRules: Rules = makeRules();
