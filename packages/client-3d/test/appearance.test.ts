import { expect, test } from "vitest";
import {
  ACCESSORIES,
  appearanceFromName,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  randomAppearance,
  SHIRT_COLORS,
  SKIN_TONES,
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
  }
});
