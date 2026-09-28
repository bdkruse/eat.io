/**
 * Whether this browser has seen the menu's "How to play" hint (spec §5.1). Every read and
 * write is wrapped: private browsing or a blocked storage can throw, and then the hint just
 * shows again next visit.
 */

export const TUTORIAL_HINT_KEY = "eatio.tutorialHintSeen";

/** The browser's localStorage, or null where touching it throws. */
export function browserStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** False when storage is null or throws. */
export function tutorialHintSeen(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(TUTORIAL_HINT_KEY) === "true";
  } catch {
    return false;
  }
}

/** Swallows errors. */
export function markTutorialHintSeen(storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(TUTORIAL_HINT_KEY, "true");
  } catch {
    // The hint shows again next visit; nothing else depends on it.
  }
}
