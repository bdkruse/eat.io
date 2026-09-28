import {
  AppearanceSchema,
  FREE_ACCESSORIES,
  FREE_EYE_COLORS,
  FREE_EYE_SHAPES,
  FREE_GRAPHICS,
  FREE_HAIR_COLORS,
  FREE_MOUTH_SHAPES,
  FREE_ONE_PIECES,
  FREE_SHIRT_COLORS,
  FREE_TOPS,
  BOTTOMS,
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
  visibleClothing,
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

test("the default look wears a tee, pants, no one-piece, and the star graphic", () => {
  expect(DEFAULT_APPEARANCE).toMatchObject({ top: "tee", bottom: "pants", onePiece: "none", graphic: "star" });
});

test("generated kids wear only free clothing", () => {
  for (let seed = 0; seed < 500; seed++) {
    const look = randomAppearance(seed);
    expect(lockedItemsIn(look, [])).toEqual([]);
    expect(FREE_TOPS).toContain(look.top);
    expect(BOTTOMS).toContain(look.bottom);
    expect(FREE_ONE_PIECES).toContain(look.onePiece);
    expect(FREE_GRAPHICS).toContain(look.graphic);
  }
});

test("the clothing is drawn after every other field, so a seed's earlier looks are unchanged", () => {
  // Recorded from randomAppearance before the clothing fields existed.
  const lookBeforeClothingBySeed: Record<number, object> = {
    0: { skinTone: "#e2b087", hairStyle: "short", hairColor: "#3d2a1e", shirtColor: "#4a7fa5", pantsColor: "#b59a6d", accessory: "none", eyeShape: "sleepy", eyeColor: "#8e7240", mouthShape: "grin" },
    1: { skinTone: "#9f6641", hairStyle: "short", hairColor: "#8a3b1f", shirtColor: "#f4f1ea", pantsColor: "#6b7048", accessory: "none", eyeShape: "sparkly", eyeColor: "#8e7240", mouthShape: "calm" },
    7: { skinTone: "#f6d7bf", hairStyle: "short", hairColor: "#d9b25f", shirtColor: "#3e9c95", pantsColor: "#444a52", accessory: "none", eyeShape: "round", eyeColor: "#6b4226", mouthShape: "smirk" },
    42: { skinTone: "#9f6641", hairStyle: "curly", hairColor: "#d9b25f", shirtColor: "#3e9c95", pantsColor: "#3f5a7a", accessory: "none", eyeShape: "round", eyeColor: "#4f8a4c", mouthShape: "calm" },
    123456789: { skinTone: "#e2b087", hairStyle: "puffs", hairColor: "#c4622d", shirtColor: "#4a7fa5", pantsColor: "#b59a6d", accessory: "beanie", eyeShape: "round", eyeColor: "#3b2417", mouthShape: "smile" },
  };
  for (const [seed, lookBeforeClothing] of Object.entries(lookBeforeClothingBySeed)) {
    const { top, bottom, onePiece, graphic, ...lookWithoutClothing } = randomAppearance(Number(seed));
    expect(lookWithoutClothing).toEqual(lookBeforeClothing);
  }
});

test("a tee shows the top and the bottom, and no graphic", () => {
  expect(visibleClothing({ ...DEFAULT_APPEARANCE, top: "tee", bottom: "shorts", graphic: "pizza" })).toEqual({
    top: "tee",
    bottom: "shorts",
    onePiece: "none",
    graphic: null,
  });
});

test("a graphic T shows its graphic", () => {
  expect(visibleClothing({ ...DEFAULT_APPEARANCE, top: "graphicTee", bottom: "skirt", graphic: "dinosaur" })).toEqual({
    top: "graphicTee",
    bottom: "skirt",
    onePiece: "none",
    graphic: "dinosaur",
  });
});

test("a dress covers a graphic T and the bottom, graphic and all", () => {
  expect(visibleClothing({ ...DEFAULT_APPEARANCE, top: "graphicTee", graphic: "taco", onePiece: "dress" })).toEqual({
    top: null,
    bottom: null,
    onePiece: "dress",
    graphic: null,
  });
});

test("overalls cover the bottom and sit over the top", () => {
  expect(visibleClothing({ ...DEFAULT_APPEARANCE, top: "hoodie", bottom: "skirt", onePiece: "overalls" })).toEqual({
    top: "hoodie",
    bottom: null,
    onePiece: "overalls",
    graphic: null,
  });
});

test("overalls over a graphic T still show the graphic", () => {
  expect(visibleClothing({ ...DEFAULT_APPEARANCE, top: "graphicTee", graphic: "rainbow", onePiece: "overalls" }).graphic).toBe("rainbow");
});

test("a sparkly dress covers the top and the bottom like a plain one", () => {
  expect(visibleClothing({ ...DEFAULT_APPEARANCE, top: "catEarHoodie", bottom: "pants", onePiece: "sparklyDress" })).toEqual({
    top: null,
    bottom: null,
    onePiece: "sparklyDress",
    graphic: null,
  });
});

test("an unowned shop graphic falls back to the star, and an unowned top and one-piece to their first free values", () => {
  const look = { ...DEFAULT_APPEARANCE, top: "catEarHoodie", onePiece: "sparklyDress", graphic: "dinosaur" } as const;
  expect(withoutLockedItems(look, [])).toEqual({ ...look, top: "tee", onePiece: "none", graphic: "star" });
});
