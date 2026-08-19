/**
 * §2.8.3: food quantity IS the tray's value — one shape per point, spread across the
 * wells in proportion to their capacity and stable across updates.
 *
 * Placement depends only on (trayId, wellIndex, slotIndex), never on the current total.
 * That is what lets a tray gain or lose food without the remaining shapes rearranging.
 */

export interface Well {
  width: number;
  height: number;
  columns: number;
  rows: number;
}

/** Your tray: 130x104, one large well (74x88) and two small (34x42) — §2.8.3. */
export const YOUR_WELLS: readonly Well[] = [
  { width: 74, height: 88, columns: 3, rows: 4 },
  { width: 34, height: 42, columns: 1, rows: 2 },
  { width: 34, height: 42, columns: 1, rows: 2 },
];

/** The opponent's tray: 108x74, two wells, read-only and smaller. */
export const OPPONENT_WELLS: readonly Well[] = [
  { width: 60, height: 58, columns: 3, rows: 2 },
  { width: 30, height: 42, columns: 1, rows: 2 },
];

const FOOD_COLORS = ["#e2703a", "#5f9e4a", "#e8c04d", "#c9543f", "#7fae6b", "#d98f3d"] as const;

/** FNV-1a — small, dependency-free, and stable across runs. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic 0..1 from a seed, used only for jitter and shape choice. */
function unitRandom(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value >>>= 0;
  value ^= value >> 17;
  value ^= value << 5;
  value >>>= 0;
  return value / 0xffffffff;
}

/**
 * Largest-remainder apportionment, clamped per well. Returns how many food shapes each
 * well receives; the caller compares the total against `value` to find any overflow.
 */
export function distribute(value: number, capacities: readonly number[]): number[] {
  const totalCapacity = capacities.reduce((total, capacity) => total + capacity, 0);
  const target = Math.max(0, Math.min(value, totalCapacity));
  if (target === 0) return capacities.map(() => 0);

  const exact = capacities.map((capacity) => (capacity / totalCapacity) * target);
  const counts = exact.map((share, index) => Math.min(Math.floor(share), capacities[index]!));

  let remaining = target - counts.reduce((total, count) => total + count, 0);
  const byRemainder = exact
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  // Hand out the leftovers, skipping any well that is already full.
  while (remaining > 0) {
    const before = remaining;
    for (const { index } of byRemainder) {
      if (remaining === 0) break;
      if (counts[index]! >= capacities[index]!) continue;
      counts[index]! += 1;
      remaining -= 1;
    }
    if (remaining === before) break; // every well full — cannot place more
  }
  return counts;
}

export interface FoodShape {
  /** Stable across value changes, so React keys and position assertions both hold. */
  key: string;
  x: number;
  y: number;
  size: number;
  kind: "circle" | "square";
  color: string;
}

export function foodForWell(
  trayId: string,
  wellIndex: number,
  count: number,
  well: Well,
): FoodShape[] {
  const shapes: FoodShape[] = [];
  const cellWidth = well.width / well.columns;
  const cellHeight = well.height / well.rows;
  const size = Math.max(6, Math.min(cellWidth, cellHeight) * 0.62);

  for (let slot = 0; slot < count; slot++) {
    const column = slot % well.columns;
    const row = Math.floor(slot / well.columns);
    const seed = hashString(`${trayId}:${wellIndex}:${slot}`);
    const jitterX = (unitRandom(seed) - 0.5) * (cellWidth - size) * 0.6;
    const jitterY = (unitRandom(seed ^ 0x9e3779b9) - 0.5) * (cellHeight - size) * 0.6;

    shapes.push({
      key: `${trayId}:${wellIndex}:${slot}`,
      x: cellWidth * (column + 0.5) + jitterX - size / 2,
      y: cellHeight * (row + 0.5) + jitterY - size / 2,
      size,
      kind: unitRandom(seed ^ 0x5bf03635) < 0.5 ? "circle" : "square",
      color: FOOD_COLORS[seed % FOOD_COLORS.length]!,
    });
  }
  return shapes;
}

export interface TrayFood {
  perWell: FoodShape[][];
  /** Food the tray cannot physically show; rendered as a `+N` chip (§2.8.3). */
  overflow: number;
}

export function layoutTray(trayId: string, value: number, wells: readonly Well[]): TrayFood {
  const capacities = wells.map((well) => well.columns * well.rows);
  const counts = distribute(value, capacities);
  const placed = counts.reduce((total, count) => total + count, 0);
  return {
    perWell: counts.map((count, index) => foodForWell(trayId, index, count, wells[index]!)),
    overflow: Math.max(0, value - placed),
  };
}
