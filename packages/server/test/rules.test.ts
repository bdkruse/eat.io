import { expect, test } from "vitest";
import { defaultRules } from "../src/engine/rules/index.js";
import { makeRng } from "../src/util/rng.js";

test("add and multiply effects dispatch over data", () => {
  const add = defaultRules.cards.find((c) => c.action === "add")!;
  const mul = defaultRules.cards.find((c) => c.action === "multiply")!;
  expect(defaultRules.applyEffect({ id: "t", value: 3 }, add).value).toBe(3 + add.amount);
  expect(defaultRules.applyEffect({ id: "t", value: 3 }, mul).value).toBe(3 * mul.amount);
});

test("buildDeck is deterministic per seed and sized to config", () => {
  const [d1] = defaultRules.buildDeck(makeRng(1));
  const [d2] = defaultRules.buildDeck(makeRng(1));
  expect(d1.map((c) => c.id)).toEqual(d2.map((c) => c.id));
  expect(d1.length).toBe(defaultRules.config.deckSize);
});

test("fresh tray value is within the configured band", () => {
  let rng = makeRng(99);
  for (let i = 0; i < 50; i++) {
    const [v, n] = defaultRules.freshTrayValue(rng);
    rng = n;
    expect(v).toBeGreaterThanOrEqual(defaultRules.config.trayMin);
    expect(v).toBeLessThanOrEqual(defaultRules.config.trayMax);
  }
});
