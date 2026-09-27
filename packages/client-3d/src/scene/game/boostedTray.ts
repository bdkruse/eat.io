import type { TrayView } from "@eat.io/protocol";

/**
 * The id of the tray that just arrived boosted, or null when nothing arrived boosted this
 * update.
 *
 * Detected purely from two consecutive tables — the tray that is on `current` but was not
 * on `previous`, when the server marked it with a `bonus`. The server has already folded
 * that bonus into the tray's value (§4.3) and marks the tray itself, so a card played this
 * round from an empty list is caught too, on either side of the table. This never
 * recomputes the bonus, only decides whether to flag the tray that just arrived.
 */
export function detectBoostedTrayId(previous: TrayView[], current: TrayView[]): string | null {
  const previousIds = new Set(previous.map((tray) => tray.id));
  const arrived = current.find((tray) => !previousIds.has(tray.id));
  return arrived && (arrived.bonus ?? 0) > 0 ? arrived.id : null;
}
