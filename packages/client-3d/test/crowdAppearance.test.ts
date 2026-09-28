import { AppearanceSchema, BOTTOMS, lockedItemsIn, ONE_PIECES, SHOP_ITEMS, SKIN_TONES, TOPS } from "@eat.io/protocol";
import { describe, expect, test } from "vitest";
import { visibleClothing } from "../src/appearance/appearance.js";
import { crowdAppearance } from "../src/appearance/crowdAppearance.js";
import {
  CROWD_SIZE,
  DINER_SEATS,
  LINE_SPOTS,
  lineCrowdIndex,
  WALK_LOOPS,
  walkerCrowdIndex,
  WALKERS_PER_LOOP,
} from "../src/scene/cafeteria/layout.js";

const looksFrom = (firstIndex: number, count: number) =>
  Array.from({ length: count }, (_, offset) => crowdAppearance(firstIndex + offset));

const wearsShopValue = (crowdIndex: number) => lockedItemsIn(crowdAppearance(crowdIndex), []).length > 0;

describe("skin tones", () => {
  test("any 10 consecutive kids wear every tone once", () => {
    for (let firstIndex = 0; firstIndex < 200; firstIndex++) {
      const tones = new Set(looksFrom(firstIndex, 10).map((look) => look.skinTone));
      expect(tones.size).toBe(SKIN_TONES.length);
    }
  });

  test("across the whole crowd, no two tone counts differ by more than one", () => {
    const countByTone = new Map<string, number>(SKIN_TONES.map((tone) => [tone, 0]));
    for (const look of looksFrom(0, CROWD_SIZE)) countByTone.set(look.skinTone, countByTone.get(look.skinTone)! + 1);
    const counts = [...countByTone.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("clothing", () => {
  // Several windows, aligned and not, and past the first block (ledger ruling).
  const windowStarts = [0, 7, 13, 19, 21, 40, 57, 133];

  test("every top, bottom, and one-piece value is stored within any 40 consecutive kids", () => {
    for (const firstIndex of windowStarts) {
      const looks = looksFrom(firstIndex, 40);
      expect(new Set(looks.map((look) => look.top))).toEqual(new Set(TOPS));
      expect(new Set(looks.map((look) => look.bottom))).toEqual(new Set(BOTTOMS));
      expect(new Set(looks.map((look) => look.onePiece))).toEqual(new Set(ONE_PIECES));
    }
  });

  test("every top and bottom is also visible, not only stored under a dress", () => {
    for (const firstIndex of windowStarts) {
      const shown = looksFrom(firstIndex, 40).map(visibleClothing);
      expect(new Set(shown.map((clothing) => clothing.top).filter((top) => top !== null))).toEqual(new Set(TOPS));
      expect(new Set(shown.map((clothing) => clothing.bottom).filter((bottom) => bottom !== null))).toEqual(new Set(BOTTOMS));
    }
  });
});

describe("shop items", () => {
  test("exactly 75 of any 100 consecutive kids wear at least one shop value", () => {
    for (const firstIndex of [0, 1, 2, 3, 37, 100]) {
      const wearers = Array.from({ length: 100 }, (_, offset) => wearsShopValue(firstIndex + offset)).filter(Boolean);
      expect(wearers.length).toBe(75);
    }
  });

  test("the crowd wears shop items from every field, and most of the catalog", () => {
    const wornItemIds = new Set(looksFrom(0, 200).flatMap((look) => lockedItemsIn(look, [])));
    const wornFields = new Set(SHOP_ITEMS.filter((item) => wornItemIds.has(item.id)).map((item) => item.unlocks.field));
    expect(wornFields).toEqual(new Set(SHOP_ITEMS.map((item) => item.unlocks.field)));
    expect(wornItemIds.size).toBeGreaterThanOrEqual(SHOP_ITEMS.length - 2);
  });

  test("a shop graphic is always on a visible graphic T", () => {
    for (const look of looksFrom(0, 200)) {
      const shopGraphic = lockedItemsIn(look, []).some((itemId) => itemId.startsWith("graphic."));
      if (shopGraphic) expect(visibleClothing(look).graphic).toBe(look.graphic);
    }
  });
});

test("the same index always gives the same look", () => {
  expect(looksFrom(0, 60)).toEqual(looksFrom(0, 60));
  expect(crowdAppearance(41)).not.toEqual(crowdAppearance(42));
});

test("every look parses as a stored appearance, unchanged", () => {
  for (const look of looksFrom(0, 200)) expect(AppearanceSchema.parse(look)).toEqual(look);
});

test("every crowd kid in the scene has its own index, from 0 to the crowd size", () => {
  const walkerIndices = WALK_LOOPS.flatMap((_, loopIndex) =>
    Array.from({ length: WALKERS_PER_LOOP }, (_, indexOnLoop) => walkerCrowdIndex(loopIndex, indexOnLoop)),
  );
  const lineIndices = LINE_SPOTS.map((_, spotIndex) => lineCrowdIndex(spotIndex));
  const dinerIndices = DINER_SEATS.flat().map((seat) => seat.crowdIndex);
  const allIndices = [...walkerIndices, ...lineIndices, ...dinerIndices].sort((first, second) => first - second);
  expect(allIndices).toEqual(Array.from({ length: CROWD_SIZE }, (_, index) => index));
});

test("low detail keeps one walker per loop, and those walkers come first", () => {
  const firstWalkers = WALK_LOOPS.map((_, loopIndex) => walkerCrowdIndex(loopIndex, 0)).sort((first, second) => first - second);
  expect(firstWalkers).toEqual(WALK_LOOPS.map((_, loopIndex) => loopIndex));
});
