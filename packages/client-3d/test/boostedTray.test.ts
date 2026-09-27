import { expect, test } from "vitest";
import type { OpponentView, TrayView } from "@eat.io/protocol";
import { detectBoostedTrayId } from "../src/scene/game/boostedTray.js";

const tray = (id: string, value = 3): TrayView => ({ id, value });
const boostedTray = (id: string, bonus: number, value = 3 + bonus): TrayView => ({ id, value, bonus });

test("a servings card played this round from an empty list flags the tray that arrives with its bonus", () => {
  // Before resolution nothing was pending; the card's bonus landed on the arriving tray.
  const previous = [tray("t1"), tray("t2")];
  const current = [tray("t2"), boostedTray("t3", 2)];
  expect(detectBoostedTrayId(previous, current)).toBe("t3");
});

test("a new tray arriving with no bonus is not boosted", () => {
  const previous = [tray("t1")];
  const current = [tray("t1"), tray("t2")];
  expect(detectBoostedTrayId(previous, current)).toBeNull();
});

test("no new tray means nothing is boosted, even when a tray already on the table has a bonus", () => {
  const previous = [tray("t1"), boostedTray("t2", 2)];
  const current = [tray("t1"), boostedTray("t2", 2)];
  expect(detectBoostedTrayId(previous, current)).toBeNull();
});

test("a boosted tray that stays on after arriving is not flagged again", () => {
  const previous = [tray("t1"), boostedTray("t2", 2)];
  const current = [boostedTray("t2", 2), tray("t3")];
  expect(detectBoostedTrayId(previous, current)).toBeNull();
});

test("the front tray leaving and a boosted one arriving at the same time still finds the arrival", () => {
  const previous = [tray("t1"), tray("t2")];
  const current = [tray("t2"), boostedTray("t3", 4)];
  expect(detectBoostedTrayId(previous, current)).toBe("t3");
});

test("an empty previous table flags a first tray that arrived boosted", () => {
  expect(detectBoostedTrayId([], [boostedTray("t1", 5)])).toBe("t1");
});

test("the opponent's side is flagged the same way, from the opponent's table", () => {
  const opponent = (table: TrayView[], extraServings: number[]): OpponentView => ({
    seat: "b",
    name: "Sam",
    score: 0,
    submitted: false,
    appearance: null,
    handCount: 5,
    table,
    extraServings,
  });
  const before = opponent([tray("u1"), tray("u2")], []);
  const boosted = opponent([tray("u2"), boostedTray("u3", 2)], [2]);
  const unboosted = opponent([tray("u2"), tray("u3")], []);
  expect(detectBoostedTrayId(before.table, boosted.table)).toBe("u3");
  expect(detectBoostedTrayId(before.table, unboosted.table)).toBeNull();
});
