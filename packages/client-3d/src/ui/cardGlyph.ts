import type { CardView } from "@eat.io/protocol";

/**
 * The short symbol shown on a card in the hand — everything the player needs to read the
 * effect at a glance, computed from server data alone (§9).
 */
export function cardGlyph(card: Pick<CardView, "action" | "amount" | "turns">): string {
  switch (card.action) {
    case "add":
      return `+${card.amount}`;
    case "multiply":
      return `×${card.amount}`;
    case "addAll":
      return `+${card.amount} all`;
    case "extraServings":
      return `+${card.amount} ×${card.turns}`;
    default: {
      const never: never = card.action;
      return never;
    }
  }
}
