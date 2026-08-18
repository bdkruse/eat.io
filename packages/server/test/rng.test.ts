import { expect, test } from "vitest";
import { makeRng, nextInt, shuffle } from "../src/util/rng.js";

test("same seed yields the same sequence", () => {
  const seq = (seed: number) => {
    let rng = makeRng(seed);
    const out: number[] = [];
    for (let i = 0; i < 5; i++) { const [v, n] = nextInt(rng, 100); out.push(v); rng = n; }
    return out;
  };
  expect(seq(42)).toEqual(seq(42));
  expect(seq(42)).not.toEqual(seq(43));
});

test("shuffle is a permutation and is deterministic per seed", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const [a] = shuffle(makeRng(7), items);
  const [b] = shuffle(makeRng(7), items);
  expect(a).toEqual(b);
  expect([...a].sort((x, y) => x - y)).toEqual(items);
});
