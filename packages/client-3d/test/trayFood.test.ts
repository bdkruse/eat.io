import { expect, test } from "vitest";
import { TRAY_CAPACITY, trayFood } from "../src/scene/game/trayFood.js";
import { TRAY_DIMENSIONS } from "../src/scene/game/tableLayout.js";

test("one food item per point, up to the tray's capacity", () => {
  for (let value = 0; value <= TRAY_CAPACITY; value++) {
    const food = trayFood("7", value);
    expect(food.items).toHaveLength(value);
    expect(food.overflow).toBe(0);
  }
});

test("a value past capacity caps the food and reports the rest as overflow", () => {
  const food = trayFood("7", 40);
  expect(food.items).toHaveLength(TRAY_CAPACITY);
  expect(food.overflow).toBe(40 - TRAY_CAPACITY);
});

test("negative and zero values put nothing on the tray", () => {
  expect(trayFood("7", 0).items).toHaveLength(0);
  expect(trayFood("7", -3).items).toHaveLength(0);
});

test("every item sits inside the tray's footprint", () => {
  for (const item of trayFood("12", TRAY_CAPACITY).items) {
    expect(Math.abs(item.x) + item.size / 2).toBeLessThanOrEqual(TRAY_DIMENSIONS.length / 2);
    expect(Math.abs(item.z) + item.size / 2).toBeLessThanOrEqual(TRAY_DIMENSIONS.depth / 2);
  }
});

test("placement is deterministic per tray", () => {
  expect(trayFood("3", 6)).toEqual(trayFood("3", 6));
});

test("each well holds a single kind of food", () => {
  const byWell = new Map<string, Set<string>>();
  for (const item of trayFood("9", TRAY_CAPACITY).items) {
    const wellIndex = item.key.split(":")[1]!;
    const kinds = byWell.get(wellIndex) ?? new Set<string>();
    kinds.add(item.kind);
    byWell.set(wellIndex, kinds);
  }
  for (const kinds of byWell.values()) expect(kinds.size).toBe(1);
});
