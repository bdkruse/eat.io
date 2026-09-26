import { expect, test } from "vitest";
import { distribute, layoutTray, OPPONENT_WELLS, YOUR_WELLS } from "../src/food/foodLayout.js";

const capacityOf = (wells: typeof YOUR_WELLS) =>
  wells.reduce((total, well) => total + well.columns * well.rows, 0);

test("distribute places every unit and never exceeds a well's capacity", () => {
  const capacities = [12, 2, 2];
  for (let value = 0; value <= 16; value++) {
    const spread = distribute(value, capacities);
    expect(spread.reduce((a, b) => a + b, 0)).toBe(Math.min(value, 16));
    spread.forEach((count, index) => expect(count).toBeLessThanOrEqual(capacities[index]!));
  }
});

test("distribute favours the larger well proportionally", () => {
  const [large, smallA, smallB] = distribute(8, [12, 2, 2]);
  expect(large).toBeGreaterThan(smallA!);
  expect(smallA).toBe(smallB);
});

test("a tray's food total equals its value until the tray physically fills", () => {
  const capacity = capacityOf(YOUR_WELLS);
  const shown = (value: number) => layoutTray("t1", value, YOUR_WELLS).perWell.flat().length;
  expect(shown(1)).toBe(1);
  expect(shown(7)).toBe(7);
  expect(shown(capacity)).toBe(capacity);
});

test("past capacity the surplus becomes an overflow count, never a lost number", () => {
  const capacity = capacityOf(YOUR_WELLS);
  const laid = layoutTray("t1", capacity + 5, YOUR_WELLS);
  expect(laid.perWell.flat().length).toBe(capacity);
  expect(laid.overflow).toBe(5);
});

test("the same tray id always produces the identical layout", () => {
  expect(layoutTray("t7", 6, YOUR_WELLS)).toEqual(layoutTray("t7", 6, YOUR_WELLS));
});

test("different tray ids produce different arrangements", () => {
  const a = layoutTray("t1", 6, YOUR_WELLS).perWell.flat().map((s) => `${s.x},${s.y}`);
  const b = layoutTray("t2", 6, YOUR_WELLS).perWell.flat().map((s) => `${s.x},${s.y}`);
  expect(a).not.toEqual(b);
});

test("gaining a point adds a shape without moving the existing ones", () => {
  const before = layoutTray("t3", 5, YOUR_WELLS).perWell.flat();
  const after = layoutTray("t3", 6, YOUR_WELLS).perWell.flat();
  expect(after.length).toBe(before.length + 1);
  for (const shape of before) {
    const same = after.find((candidate) => candidate.key === shape.key);
    expect(same).toBeDefined();
    expect(same!.x).toBe(shape.x);
    expect(same!.y).toBe(shape.y);
  }
});

test("losing a point removes shapes without moving the survivors", () => {
  const before = layoutTray("t4", 9, YOUR_WELLS).perWell.flat();
  const after = layoutTray("t4", 4, YOUR_WELLS).perWell.flat();
  for (const shape of after) {
    const same = before.find((candidate) => candidate.key === shape.key)!;
    expect(same.x).toBe(shape.x);
    expect(same.y).toBe(shape.y);
  }
});

test("the opponent's smaller tray has its own, smaller capacity", () => {
  expect(capacityOf(OPPONENT_WELLS)).toBeLessThan(capacityOf(YOUR_WELLS));
  expect(layoutTray("t1", 99, OPPONENT_WELLS).perWell.flat().length).toBe(
    capacityOf(OPPONENT_WELLS),
  );
});

test("a zero-value tray is simply empty", () => {
  const laid = layoutTray("t5", 0, YOUR_WELLS);
  expect(laid.perWell.flat()).toEqual([]);
  expect(laid.overflow).toBe(0);
});
