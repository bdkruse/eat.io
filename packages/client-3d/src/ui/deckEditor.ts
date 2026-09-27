import { DECK_LIMITS, deckProblem, deckTotal, type DeckCard, type DeckEntry } from "@eat.io/protocol";

/**
 * The creator panel's working copy of the deck: one editable copy count per catalog card
 * id. Seeded from the server's `deck` message and mutated locally as the Creator edits,
 * until Save converts it back into `deckSave`'s `DeckEntry[]` (§9).
 */
export type DeckCopiesDraft = Record<string, number>;

/** Seeds a fresh draft from the server's own card list — the starting point each time the
 *  panel opens. */
export function createDeckDraft(cards: readonly DeckCard[]): DeckCopiesDraft {
  const draft: DeckCopiesDraft = {};
  for (const card of cards) draft[card.id] = card.copies;
  return draft;
}

/** The − and + buttons: a deliberate, bounded step, clamped to the copies-per-card range
 *  so clicking past either end just stops there instead of drifting into a nonsense count. */
export function stepDeckCardCopies(draft: DeckCopiesDraft, cardId: string, delta: number): DeckCopiesDraft {
  const current = draft[cardId] ?? 0;
  return { ...draft, [cardId]: clampCopies(current + delta) };
}

/** The typed number field: stored exactly as entered, even outside the range — Save stays
 *  disabled and `deckDraftProblem` names the reason, the same "clamp nothing silently"
 *  rule the admin panel's fields follow (§9). */
export function setDeckCardCopies(draft: DeckCopiesDraft, cardId: string, copies: number): DeckCopiesDraft {
  return { ...draft, [cardId]: Math.trunc(copies) };
}

/** The draft as `deckSave`'s entries, in the server's own card order. A card the draft has
 *  no entry for (freshly added to the catalog since the draft was seeded) counts as 0,
 *  the same as an unsaved card does on the server (§5). */
export function deckDraftToEntries(cards: readonly DeckCard[], draft: DeckCopiesDraft): DeckEntry[] {
  return cards.map((card) => ({ cardId: card.id, copies: draft[card.id] ?? 0 }));
}

export function deckDraftTotal(cards: readonly DeckCard[], draft: DeckCopiesDraft): number {
  return deckTotal(deckDraftToEntries(cards, draft));
}

/** null when the draft would save cleanly, else the message to show and disable Save
 *  with — delegates to protocol's own `deckProblem` so the panel and the server can never
 *  drift apart (§7). */
export function deckDraftProblem(cards: readonly DeckCard[], draft: DeckCopiesDraft): string | null {
  return deckProblem(
    deckDraftToEntries(cards, draft),
    cards.map((card) => card.id),
  );
}

function clampCopies(value: number): number {
  return Math.max(DECK_LIMITS.copiesPerCard.min, Math.min(DECK_LIMITS.copiesPerCard.max, Math.trunc(value)));
}
