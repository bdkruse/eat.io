import {
  AppearanceSchema,
  FREE_ACCESSORIES,
  FREE_EYE_COLORS,
  FREE_EYE_SHAPES,
  FREE_HAIR_COLORS,
  FREE_MOUTH_SHAPES,
  FREE_SHIRT_COLORS,
  lockedItemsIn,
} from "@eat.io/protocol";
import { expect, test } from "vitest";
import {
  ACCESSORIES,
  appearanceFromName,
  DEFAULT_APPEARANCE,
  EYE_COLORS,
  EYE_SHAPES,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_SHAPES,
  PANTS_COLORS,
  randomAppearance,
  SHIRT_COLORS,
  SKIN_TONES,
  wearingShopItem,
  withoutLockedItems,
} from "../src/appearance/appearance.js";

test("the same seed always makes the same kid", () => {
  expect(randomAppearance(42)).toEqual(randomAppearance(42));
});

test("the same opponent name always makes the same kid", () => {
  expect(appearanceFromName("Robin")).toEqual(appearanceFromName("Robin"));
});

test("different seeds make a varied crowd", () => {
  const looks = new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(randomAppearance(seed))));
  expect(looks.size).toBeGreaterThan(25);
});

test("generated kids only use listed options", () => {
  for (let seed = 0; seed < 200; seed++) {
    const look = randomAppearance(seed);
    expect(SKIN_TONES).toContain(look.skinTone);
    expect(HAIR_STYLES).toContain(look.hairStyle);
    expect(HAIR_COLORS).toContain(look.hairColor);
    expect(SHIRT_COLORS).toContain(look.shirtColor);
    expect(PANTS_COLORS).toContain(look.pantsColor);
    expect(ACCESSORIES).toContain(look.accessory);
    expect(EYE_SHAPES).toContain(look.eyeShape);
    expect(EYE_COLORS).toContain(look.eyeColor);
    expect(MOUTH_SHAPES).toContain(look.mouthShape);
  }
});

test("generated kids never wear a shop item, and always have a face", () => {
  const seenFaces = { eyeShapes: new Set<string>(), eyeColors: new Set<string>(), mouthShapes: new Set<string>() };
  for (let seed = 0; seed < 2000; seed++) {
    const look = randomAppearance(seed);
    expect(lockedItemsIn(look, [])).toEqual([]);
    expect(FREE_HAIR_COLORS).toContain(look.hairColor);
    expect(FREE_SHIRT_COLORS).toContain(look.shirtColor);
    expect(FREE_ACCESSORIES).toContain(look.accessory);
    expect(FREE_EYE_SHAPES).toContain(look.eyeShape);
    expect(FREE_EYE_COLORS).toContain(look.eyeColor);
    expect(FREE_MOUTH_SHAPES).toContain(look.mouthShape);
    seenFaces.eyeShapes.add(look.eyeShape);
    seenFaces.eyeColors.add(look.eyeColor);
    seenFaces.mouthShapes.add(look.mouthShape);
  }
  // Every free face value turns up somewhere in the crowd.
  expect(seenFaces.eyeShapes.size).toBe(FREE_EYE_SHAPES.length);
  expect(seenFaces.eyeColors.size).toBe(FREE_EYE_COLORS.length);
  expect(seenFaces.mouthShapes.size).toBe(FREE_MOUTH_SHAPES.length);
});

test("the default look is free and complete", () => {
  expect(AppearanceSchema.parse(DEFAULT_APPEARANCE)).toEqual(DEFAULT_APPEARANCE);
  expect(lockedItemsIn(DEFAULT_APPEARANCE, [])).toEqual([]);
});

test("wearing a shop item sets just the field it unlocks", () => {
  expect(wearingShopItem(DEFAULT_APPEARANCE, "extra.crown")).toEqual({ ...DEFAULT_APPEARANCE, accessory: "crown" });
  expect(wearingShopItem(DEFAULT_APPEARANCE, "eyeColor.violet")).toEqual({ ...DEFAULT_APPEARANCE, eyeColor: "#8a4fd1" });
});

test("wearing an unknown item id leaves the look as it is", () => {
  expect(wearingShopItem(DEFAULT_APPEARANCE, "extra.nothing")).toBe(DEFAULT_APPEARANCE);
});

test("withoutLockedItems swaps each unowned shop value for its field's first free value and keeps the rest", () => {
  const look = { ...DEFAULT_APPEARANCE, accessory: "crown", hairColor: "#c9ccd1", mouthShape: "fangs", hairStyle: "bob" } as const;
  expect(withoutLockedItems(look, ["hair.silver"])).toEqual({
    ...look,
    accessory: FREE_ACCESSORIES[0],
    mouthShape: FREE_MOUTH_SHAPES[0],
  });
  // A guest owns nothing, so every shop value comes off.
  expect(withoutLockedItems(look, [])).toEqual({
    ...look,
    accessory: FREE_ACCESSORIES[0],
    hairColor: FREE_HAIR_COLORS[0],
    mouthShape: FREE_MOUTH_SHAPES[0],
  });
});

test("withoutLockedItems returns the same look when nothing is locked", () => {
  expect(withoutLockedItems(DEFAULT_APPEARANCE, [])).toBe(DEFAULT_APPEARANCE);
});
