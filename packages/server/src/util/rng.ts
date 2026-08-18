export interface Rng {
  readonly state: number;
}

export function makeRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

// mulberry32 — small, fast, fully determined by state.
export function nextUint32(rng: Rng): [number, Rng] {
  const t = (rng.state + 0x6d2b79f5) >>> 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  r = (r ^ (r >>> 14)) >>> 0;
  return [r, { state: t }];
}

export function nextInt(rng: Rng, maxExclusive: number): [number, Rng] {
  if (maxExclusive <= 0) throw new Error("nextInt: maxExclusive must be > 0");
  const [u, next] = nextUint32(rng);
  return [u % maxExclusive, next];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): [T[], Rng] {
  const arr = items.slice();
  let cur = rng;
  for (let i = arr.length - 1; i > 0; i--) {
    const [j, next] = nextInt(cur, i + 1);
    cur = next;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return [arr, cur];
}

export function pick<T>(rng: Rng, items: readonly T[]): [T, Rng] {
  if (items.length === 0) throw new Error("pick: empty array");
  const [i, next] = nextInt(rng, items.length);
  return [items[i]!, next];
}
