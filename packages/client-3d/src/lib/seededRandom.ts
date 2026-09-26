/** FNV-1a — small, dependency-free, and stable across runs. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface SeededRandom {
  /** 0 (inclusive) to 1 (exclusive). */
  next(): number;
  range(minimum: number, maximum: number): number;
  pick<Item>(items: readonly Item[]): Item;
  chance(probability: number): boolean;
}

/**
 * mulberry32. The scene uses this instead of Math.random so the lunchroom is laid out
 * the same way on every load, and a given name always produces the same kid.
 */
export function createRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (minimum, maximum) => minimum + next() * (maximum - minimum),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    chance: (probability) => next() < probability,
  };
}
