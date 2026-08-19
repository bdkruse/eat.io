/**
 * Local UI state for what the player has picked. Tracks the selection only — whether it
 * is a *legal move* is the server's decision (§2.6, §0.8).
 */
export interface Selection {
  cardId: string | null;
  /** In click order — §2.8.5 shows numbered badges for multi-target cards. */
  targetTrayIds: string[];
}

export const emptySelection: Selection = { cardId: null, targetTrayIds: [] };

export function selectCard(selection: Selection, cardId: string): Selection {
  if (selection.cardId === cardId) return selection;
  return { cardId, targetTrayIds: [] };
}

export interface TrayClickResult {
  selection: Selection;
  /** True when the click was refused because no card is chosen — the caller toasts. */
  needsCardFirst: boolean;
}

export function toggleTray(
  selection: Selection,
  trayId: string,
  targetCount: number,
): TrayClickResult {
  if (selection.cardId === null) {
    return { selection, needsCardFirst: true };
  }
  if (selection.targetTrayIds.includes(trayId)) {
    return {
      selection: {
        ...selection,
        targetTrayIds: selection.targetTrayIds.filter((id) => id !== trayId),
      },
      needsCardFirst: false,
    };
  }
  // Past the card's capacity, drop the oldest rather than refusing the click (§2.8.5).
  const appended = [...selection.targetTrayIds, trayId];
  const targetTrayIds =
    appended.length > targetCount ? appended.slice(appended.length - targetCount) : appended;
  return { selection: { ...selection, targetTrayIds }, needsCardFirst: false };
}

/** End turn is enabled from this and nothing else (§2.8.5). */
export function isSubmittable(selection: Selection, targetCount: number): boolean {
  return selection.cardId !== null && selection.targetTrayIds.length === targetCount;
}
