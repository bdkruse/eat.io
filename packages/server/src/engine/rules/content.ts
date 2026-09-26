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
];

export const TUNING = {
  tableLength: 5,
  handSize: 5,
  roundCount: 20,
  trayMin: 1,
  trayMax: 4,
  deckSize: 40,
} as const;
