import type { DeckEntry } from "@eat.io/protocol";
import type { CardDefinition } from "../state.js";

// ---------------------------------------------------------------------------
// PROVISIONAL base rules content. This is a starter set the owner will expand
// and rebalance — it exists only to prove the machinery end to end (§0.9).
// Do NOT treat these values as final game design.
// ---------------------------------------------------------------------------

export const CARD_CATALOG: readonly CardDefinition[] = [
  { id: "add1x1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1 },
  { id: "add1x2", name: "Add One Food To Two Trays", action: "add", amount: 1, targets: 2 },
  { id: "add3x1", name: "Add Three Food To One Tray", action: "add", amount: 3, targets: 1 },
  { id: "mul2x1", name: "Double Food On One Tray", action: "multiply", amount: 2, targets: 1 },
  { id: "mul2x2", name: "Double Food On Two Trays", action: "multiply", amount: 2, targets: 2 },
  { id: "mul3x1", name: "Triple Food On One Tray", action: "multiply", amount: 3, targets: 1 },
  { id: "addAll1", name: "Add One Food To Every Tray", action: "addAll", amount: 1, targets: 0 },
  { id: "servings2x2", name: "Extra Servings", action: "extraServings", amount: 2, targets: 0, turns: 2 },
];

/** The deck every game uses until the Creator saves another one (40 cards). */
export const STARTING_DECK: readonly DeckEntry[] = [
  { cardId: "add1x1", copies: 5 },
  { cardId: "add1x2", copies: 7 },
  { cardId: "add3x1", copies: 7 },
  { cardId: "mul2x1", copies: 7 },
  { cardId: "mul2x2", copies: 6 },
  { cardId: "mul3x1", copies: 6 },
  { cardId: "addAll1", copies: 1 },
  { cardId: "servings2x2", copies: 1 },
];

export const TUNING = {
  tableLength: 5,
  handSize: 5,
  roundCount: 20,
  trayMin: 1,
  trayMax: 4,
} as const;
