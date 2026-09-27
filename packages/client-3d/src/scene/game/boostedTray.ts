import type { TrayView } from "@eat.io/protocol";

/** One player's table and upcoming bonuses at a single moment, as carried on `roomState`. */
export interface BoardSnapshot {
  table: TrayView[];
  extraServings: number[];
}

/**
 * The id of the tray that just arrived already covered by a pending bonus, or null when
 * nothing arrived boosted this update.
 *
 * Detected purely from two consecutive board snapshots — the tray that is on `current`
 * but was not on `previous`, when `previous`'s first upcoming bonus was greater than zero.
 * The server has already folded that bonus into the tray's value (§4.3); this never
 * recomputes it, only decides whether to flag the tray that just arrived.
 */
export function detectBoostedTrayId(previous: BoardSnapshot, current: BoardSnapshot): string | null {
  const pendingBonus = previous.extraServings[0] ?? 0;
  if (pendingBonus <= 0) return null;
  const previousIds = new Set(previous.table.map((tray) => tray.id));
  const arrived = current.table.find((tray) => !previousIds.has(tray.id));
  return arrived ? arrived.id : null;
}
