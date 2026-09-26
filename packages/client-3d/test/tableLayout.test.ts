import { describe, expect, test } from "vitest";
import {
  EATER_POSITION,
  SEAT_POSITION,
  TABLE_DIMENSIONS,
  traySlotPosition,
  traySpawnPosition,
} from "../src/scene/game/tableLayout.js";

const distanceToEater = ([x, , z]: number[]) => Math.hypot(x! - EATER_POSITION[0], z! - EATER_POSITION[2]);

describe("tray slots", () => {
  test.each(["near", "far"] as const)("slot 0 is the one nearest the eater on the %s side", (side) => {
    const distances = [0, 1, 2, 3, 4].map((slot) => distanceToEater(traySlotPosition(side, slot)));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  test("your trays sit on the near side, the opponent's on the far side", () => {
    expect(traySlotPosition("near", 0)[2]).toBeGreaterThan(0);
    expect(traySlotPosition("far", 0)[2]).toBeLessThan(0);
    expect(SEAT_POSITION.near[2]).toBeGreaterThan(0);
    expect(SEAT_POSITION.far[2]).toBeLessThan(0);
  });

  test("five trays fit on the table top and rest on it", () => {
    for (const side of ["near", "far"] as const) {
      for (let slot = 0; slot < 5; slot++) {
        const [x, y, z] = traySlotPosition(side, slot);
        expect(Math.abs(x)).toBeLessThan(TABLE_DIMENSIONS.length / 2);
        expect(Math.abs(z)).toBeLessThan(TABLE_DIMENSIONS.width / 2);
        expect(y).toBeGreaterThan(TABLE_DIMENSIONS.height);
      }
    }
  });

  test("the eater sits past the head of the table", () => {
    expect(EATER_POSITION[0]).toBeGreaterThan(TABLE_DIMENSIONS.length / 2);
  });

  test("a fresh tray enters from the foot of the table, behind the last slot", () => {
    expect(traySpawnPosition("near", 5)[0]).toBeLessThan(traySlotPosition("near", 4)[0]);
  });
});
