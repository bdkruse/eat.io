import { expect, test } from "vitest";
import { DETAIL_BUDGETS, keepsKid } from "../src/scene/detail.js";

const kept = (count: number, keepEvery: number) =>
  Array.from({ length: count }, (_, index) => index).filter((index) => keepsKid(index, keepEvery));

test("high detail draws every kid", () => {
  expect(kept(10, DETAIL_BUDGETS.high.seatedKeepEvery)).toHaveLength(10);
});

test("low detail draws a subset of the same kids, never different ones", () => {
  const high = kept(10, DETAIL_BUDGETS.high.seatedKeepEvery);
  const low = kept(10, DETAIL_BUDGETS.low.seatedKeepEvery);
  expect(low.length).toBeLessThan(high.length);
  for (const index of low) expect(high).toContain(index);
});

test("low detail is cheaper on every axis", () => {
  const { high, low } = DETAIL_BUDGETS;
  expect(low.shadows).toBe(false);
  expect(low.maxPixelRatio).toBeLessThan(high.maxPixelRatio);
  expect(low.walkersPerLoop).toBeLessThan(high.walkersPerLoop);
  expect(low.steam).toBe(false);
});
