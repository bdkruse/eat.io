import { expect, test } from "vitest";
import type { TrayView } from "@eat.io/protocol";
import { detectBoostedTrayId, type BoardSnapshot } from "../src/scene/game/boostedTray.js";

const tray = (id: string, value = 3): TrayView => ({ id, value });

const board = (over: Partial<BoardSnapshot> = {}): BoardSnapshot => ({
  table: [],
  extraServings: [],
  ...over,
});

test("a new tray arriving while a bonus was pending is the boosted one", () => {
  const previous = board({ table: [tray("t1")], extraServings: [2] });
  const current = board({ table: [tray("t1"), tray("t2")], extraServings: [] });
  expect(detectBoostedTrayId(previous, current)).toBe("t2");
});

test("no new tray means nothing is boosted, even with a bonus pending", () => {
  const previous = board({ table: [tray("t1")], extraServings: [2] });
  const current = board({ table: [tray("t1")], extraServings: [2] });
  expect(detectBoostedTrayId(previous, current)).toBeNull();
});

test("a new tray with no bonus pending is not boosted", () => {
  const previous = board({ table: [tray("t1")], extraServings: [] });
  const current = board({ table: [tray("t1"), tray("t2")], extraServings: [] });
  expect(detectBoostedTrayId(previous, current)).toBeNull();
});

test("a zero entry at the front of the list is not a pending bonus", () => {
  const previous = board({ table: [tray("t1")], extraServings: [0, 2] });
  const current = board({ table: [tray("t1"), tray("t2")], extraServings: [2] });
  expect(detectBoostedTrayId(previous, current)).toBeNull();
});

test("the front tray leaving and a new one arriving at the same time still finds the arrival", () => {
  const previous = board({ table: [tray("t1"), tray("t2")], extraServings: [4] });
  const current = board({ table: [tray("t2"), tray("t3")], extraServings: [] });
  expect(detectBoostedTrayId(previous, current)).toBe("t3");
});

test("an empty previous table boosts the very first tray", () => {
  const previous = board({ table: [], extraServings: [5] });
  const current = board({ table: [tray("t1")], extraServings: [] });
  expect(detectBoostedTrayId(previous, current)).toBe("t1");
});
