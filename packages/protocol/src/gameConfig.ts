import { z } from "zod";

// ---------- limits ----------
// The server enforces these ranges and the admin panels read them from this
// same source, so the two can never drift apart.

export const SETTINGS_LIMITS = {
  roundCount: { min: 1, max: 30 },
  turnSeconds: { min: 5, max: 120 },
  handSize: { min: 3, max: 8 },
} as const;

export const DECK_LIMITS = {
  copiesPerCard: { min: 0, max: 40 },
  total: { min: 10, max: 100 },
} as const;

// ---------- game settings ----------

export const GameSettingsSchema = z.object({
  roundCount: z.number().int(),
  turnSeconds: z.number().int(),
  handSize: z.number().int(),
});
export type GameSettings = z.infer<typeof GameSettingsSchema>;

/** null when valid, else a message naming the broken limit. */
export function settingsProblem(settings: GameSettings): string | null {
  if (isOutOfRange(settings.roundCount, SETTINGS_LIMITS.roundCount)) {
    return `Round count must be a whole number between ${SETTINGS_LIMITS.roundCount.min} and ${SETTINGS_LIMITS.roundCount.max}.`;
  }
  if (isOutOfRange(settings.turnSeconds, SETTINGS_LIMITS.turnSeconds)) {
    return `Turn clock must be a whole number of seconds between ${SETTINGS_LIMITS.turnSeconds.min} and ${SETTINGS_LIMITS.turnSeconds.max}.`;
  }
  if (isOutOfRange(settings.handSize, SETTINGS_LIMITS.handSize)) {
    return `Hand size must be a whole number between ${SETTINGS_LIMITS.handSize.min} and ${SETTINGS_LIMITS.handSize.max}.`;
  }
  return null;
}

// ---------- deck ----------

export const DeckEntrySchema = z.object({
  cardId: z.string().max(64),
  copies: z.number().int(),
});
export type DeckEntry = z.infer<typeof DeckEntrySchema>;

export function deckTotal(entries: DeckEntry[]): number {
  return entries.reduce((totalCopies, entry) => totalCopies + entry.copies, 0);
}

/** null when valid, else a message. knownCardIds: the catalog ids. */
export function deckProblem(entries: DeckEntry[], knownCardIds: readonly string[]): string | null {
  const seenCardIds = new Set<string>();
  for (const entry of entries) {
    if (!knownCardIds.includes(entry.cardId)) {
      return `"${entry.cardId}" is not a known card.`;
    }
    if (seenCardIds.has(entry.cardId)) {
      return `"${entry.cardId}" is listed more than once.`;
    }
    seenCardIds.add(entry.cardId);
    if (isOutOfRange(entry.copies, DECK_LIMITS.copiesPerCard)) {
      return `Copies of "${entry.cardId}" must be a whole number between ${DECK_LIMITS.copiesPerCard.min} and ${DECK_LIMITS.copiesPerCard.max}.`;
    }
  }
  const total = deckTotal(entries);
  if (isOutOfRange(total, DECK_LIMITS.total)) {
    return `The deck must total between ${DECK_LIMITS.total.min} and ${DECK_LIMITS.total.max} cards, not ${total}.`;
  }
  return null;
}

// ---------- admin errors ----------

export const AdminErrorCodeSchema = z.enum(["FORBIDDEN", "INVALID_SETTINGS", "INVALID_DECK"]);
export type AdminErrorCode = z.infer<typeof AdminErrorCodeSchema>;

// ---------- internal ----------

function isOutOfRange(value: number, limit: { readonly min: number; readonly max: number }): boolean {
  return !Number.isInteger(value) || value < limit.min || value > limit.max;
}
