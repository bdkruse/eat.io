import { DECK_LIMITS, deckProblem, deckTotal, type DeckCard, type DeckEntry } from "@eat.io/protocol";

/**
 * The creator panel's working copy of the deck: the text of each card's copies field, by
 * catalog card id. Seeded from the server's `deck` message and edited locally, until Save
 * converts it back into `deckSave`'s `DeckEntry[]` (§9). It holds text, not numbers, so a
 * fractional or cleared entry stays exactly as typed and is reported rather than silently
 * changed, the same rule the admin panel's fields follow (fix round 1).
 */
export type DeckCopiesDraft = Record<string, string>;

/** Seeds a fresh draft from the server's own card list — the starting point each time the
 *  panel opens. */
export function createDeckDraft(cards: readonly DeckCard[]): DeckCopiesDraft {
  const draft: DeckCopiesDraft = {};
  for (const card of cards) draft[card.id] = String(card.copies);
  return draft;
}

/** What a card's copies field shows. A card the draft has no entry for (added to the
 *  catalog since the draft was seeded) counts as 0, the same as an unsaved card does on
 *  the server (§5). The field, the total, and Save all read through this. */
export function deckDraftCopiesText(draft: DeckCopiesDraft, cardId: string): string {
  return draft[cardId] ?? "0";
}

/** The − and + buttons: a deliberate, bounded step, clamped to the copies-per-card range
 *  so clicking past either end just stops there instead of drifting into a nonsense count.
 *  From a fractional entry, a step lands on the neighbouring whole number in its direction;
 *  from a cleared or unreadable one, it starts at 0. */
export function stepDeckCardCopies(draft: DeckCopiesDraft, cardId: string, delta: number): DeckCopiesDraft {
  const typedCopies = parseCopiesText(deckDraftCopiesText(draft, cardId));
  const startingCopies = Number.isFinite(typedCopies) ? typedCopies : 0;
  let steppedCopies: number;
  if (Number.isInteger(startingCopies)) steppedCopies = startingCopies + delta;
  else if (delta > 0) steppedCopies = Math.ceil(startingCopies) + delta - 1;
  else steppedCopies = Math.floor(startingCopies) + delta + 1;
  return { ...draft, [cardId]: String(clampCopies(steppedCopies)) };
}

/** The typed number field: stored exactly as entered, even outside the range or not a
 *  whole number — Save stays disabled and `deckDraftProblem` names the reason (§9). */
export function setDeckCardCopies(draft: DeckCopiesDraft, cardId: string, copiesText: string): DeckCopiesDraft {
  return { ...draft, [cardId]: copiesText };
}

/** The draft as `deckSave`'s entries, in the server's own card order. An entry that is not
 *  a number (a cleared field) becomes NaN, which `deckProblem` reports as not a whole
 *  number, so it can never be saved. */
export function deckDraftToEntries(cards: readonly DeckCard[], draft: DeckCopiesDraft): DeckEntry[] {
  return cards.map((card) => ({ cardId: card.id, copies: parseCopiesText(deckDraftCopiesText(draft, card.id)) }));
}

/** The live total, or null while any entry is not a number yet — there is no honest total
 *  to show until every field holds one. */
export function deckDraftTotal(cards: readonly DeckCard[], draft: DeckCopiesDraft): number | null {
  const entries = deckDraftToEntries(cards, draft);
  if (entries.some((entry) => !Number.isFinite(entry.copies))) return null;
  return deckTotal(entries);
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

/** Blank text is NaN, not 0: `Number("")` would quietly turn a cleared field into 0. */
function parseCopiesText(copiesText: string): number {
  return copiesText.trim() === "" ? Number.NaN : Number(copiesText);
}

function clampCopies(value: number): number {
  return Math.max(DECK_LIMITS.copiesPerCard.min, Math.min(DECK_LIMITS.copiesPerCard.max, Math.trunc(value)));
}
