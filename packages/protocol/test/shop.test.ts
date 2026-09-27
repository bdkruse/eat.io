import { expect, test } from "vitest";
import {
  SHOP_ITEMS,
  SHOP_PRICE_LIMITS,
  lockedItemsIn,
  AppearanceSchema,
  ACCESSORIES,
  SHIRT_COLORS,
  HAIR_COLORS,
  EYE_SHAPES,
  EYE_COLORS,
  MOUTH_SHAPES,
  FREE_ACCESSORIES,
  FREE_SHIRT_COLORS,
  FREE_HAIR_COLORS,
  FREE_EYE_SHAPES,
  FREE_EYE_COLORS,
  FREE_MOUTH_SHAPES,
  type Appearance,
} from "../src/index.js";

const FREE_LOOK: Appearance = AppearanceSchema.parse({
  skinTone: "#eec19b",
  hairStyle: "bob",
  hairColor: "#5a3825",
  shirtColor: "#4a7fa5",
  pantsColor: "#3f5a7a",
  accessory: "glasses",
  eyeShape: "almond",
  eyeColor: FREE_EYE_COLORS[3],
  mouthShape: "calm",
});

function unlockedValueOf(itemId: string): string {
  const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`no shop item ${itemId}`);
  return item.unlocks.value;
}

test("the shop catalog holds the 22 items of spec 13.2 and 13.3 with their default prices", () => {
  const priceById = Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, item.defaultPrice]));
  expect(priceById).toEqual({
    "extra.sunglasses": 30,
    "extra.bowTie": 30,
    "extra.headphones": 40,
    "extra.chefHat": 50,
    "extra.crown": 100,
    "extra.propellerCap": 60,
    "extra.trafficCone": 70,
    "extra.vikingHelmet": 80,
    "extra.alienAntennae": 60,
    "extra.bananaHat": 90,
    "shirt.gold": 100,
    "shirt.neonLime": 40,
    "shirt.midnight": 30,
    "hair.electricBlue": 50,
    "hair.bubblegum": 50,
    "hair.silver": 40,
    "eyes.star": 60,
    "eyes.heart": 60,
    "eyeColor.violet": 40,
    "eyeColor.gold": 80,
    "mouth.tongue": 50,
    "mouth.fangs": 70,
  });
});

test("shop items carry the spec names and kinds", () => {
  const nameAndKindById = Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, [item.name, item.kind]]));
  expect(nameAndKindById).toEqual({
    "extra.sunglasses": ["Sunglasses", "extra"],
    "extra.bowTie": ["Bow Tie", "extra"],
    "extra.headphones": ["Headphones", "extra"],
    "extra.chefHat": ["Chef Hat", "extra"],
    "extra.crown": ["Crown", "extra"],
    "extra.propellerCap": ["Propeller Cap", "extra"],
    "extra.trafficCone": ["Traffic Cone Hat", "extra"],
    "extra.vikingHelmet": ["Viking Helmet", "extra"],
    "extra.alienAntennae": ["Alien Antennae", "extra"],
    "extra.bananaHat": ["Banana Hat", "extra"],
    "shirt.gold": ["Gold Shirt", "shirtColor"],
    "shirt.neonLime": ["Neon Lime Shirt", "shirtColor"],
    "shirt.midnight": ["Midnight Shirt", "shirtColor"],
    "hair.electricBlue": ["Electric Blue Hair", "hairColor"],
    "hair.bubblegum": ["Bubblegum Pink Hair", "hairColor"],
    "hair.silver": ["Silver Hair", "hairColor"],
    "eyes.star": ["Star Eyes", "eyeShape"],
    "eyes.heart": ["Heart Eyes", "eyeShape"],
    "eyeColor.violet": ["Violet", "eyeColor"],
    "eyeColor.gold": ["Glowing Gold", "eyeColor"],
    "mouth.tongue": ["Tongue Out", "mouthShape"],
    "mouth.fangs": ["Vampire Fangs", "mouthShape"],
  });
});

test("every default price sits inside the price limits of 1 to 1000", () => {
  expect(SHOP_PRICE_LIMITS).toEqual({ min: 1, max: 1000 });
  for (const item of SHOP_ITEMS) {
    expect(Number.isInteger(item.defaultPrice)).toBe(true);
    expect(item.defaultPrice).toBeGreaterThanOrEqual(SHOP_PRICE_LIMITS.min);
    expect(item.defaultPrice).toBeLessThanOrEqual(SHOP_PRICE_LIMITS.max);
  }
});

test("each shop item unlocks one non-free value of the field that matches its kind", () => {
  const optionsByField: Record<string, readonly string[]> = {
    accessory: ACCESSORIES,
    shirtColor: SHIRT_COLORS,
    hairColor: HAIR_COLORS,
    eyeShape: EYE_SHAPES,
    eyeColor: EYE_COLORS,
    mouthShape: MOUTH_SHAPES,
  };
  const freeOptionsByField: Record<string, readonly string[]> = {
    accessory: FREE_ACCESSORIES,
    shirtColor: FREE_SHIRT_COLORS,
    hairColor: FREE_HAIR_COLORS,
    eyeShape: FREE_EYE_SHAPES,
    eyeColor: FREE_EYE_COLORS,
    mouthShape: FREE_MOUTH_SHAPES,
  };
  const fieldByKind = {
    extra: "accessory",
    shirtColor: "shirtColor",
    hairColor: "hairColor",
    eyeShape: "eyeShape",
    eyeColor: "eyeColor",
    mouthShape: "mouthShape",
  };
  for (const item of SHOP_ITEMS) {
    expect(item.unlocks.field).toBe(fieldByKind[item.kind]);
    expect(optionsByField[item.unlocks.field]).toContain(item.unlocks.value);
    expect(freeOptionsByField[item.unlocks.field]).not.toContain(item.unlocks.value);
  }
});

test("every option value is either free or unlocked by exactly one shop item", () => {
  const optionPairs: [string, readonly string[], readonly string[]][] = [
    ["accessory", ACCESSORIES, FREE_ACCESSORIES],
    ["shirtColor", SHIRT_COLORS, FREE_SHIRT_COLORS],
    ["hairColor", HAIR_COLORS, FREE_HAIR_COLORS],
    ["eyeShape", EYE_SHAPES, FREE_EYE_SHAPES],
    ["eyeColor", EYE_COLORS, FREE_EYE_COLORS],
    ["mouthShape", MOUTH_SHAPES, FREE_MOUTH_SHAPES],
  ];
  for (const [field, allOptions, freeOptions] of optionPairs) {
    for (const optionValue of allOptions) {
      const unlockingItems = SHOP_ITEMS.filter(
        (item) => item.unlocks.field === field && item.unlocks.value === optionValue,
      );
      expect(unlockingItems.length).toBe(freeOptions.includes(optionValue) ? 0 : 1);
    }
  }
});

test("shop item ids are unique", () => {
  const itemIds = SHOP_ITEMS.map((item) => item.id);
  expect(new Set(itemIds).size).toBe(itemIds.length);
});

test("lockedItemsIn a free look is empty", () => {
  expect(lockedItemsIn(FREE_LOOK, [])).toEqual([]);
});

test("lockedItemsIn a look with an unowned crown names the crown", () => {
  const crownLook: Appearance = { ...FREE_LOOK, accessory: "crown" };
  expect(lockedItemsIn(crownLook, [])).toEqual(["extra.crown"]);
  expect(lockedItemsIn(crownLook, ["shirt.gold"])).toEqual(["extra.crown"]);
});

test("lockedItemsIn a look with an owned crown is empty", () => {
  const crownLook: Appearance = { ...FREE_LOOK, accessory: "crown" };
  expect(lockedItemsIn(crownLook, ["extra.crown"])).toEqual([]);
});

test("lockedItemsIn names every unowned shop value the look uses", () => {
  const shopLook: Appearance = {
    ...FREE_LOOK,
    accessory: "vikingHelmet",
    shirtColor: unlockedValueOf("shirt.midnight") as Appearance["shirtColor"],
    eyeShape: "heart",
    eyeColor: unlockedValueOf("eyeColor.gold") as Appearance["eyeColor"],
    mouthShape: "fangs",
  };
  expect(lockedItemsIn(shopLook, ["eyes.heart"]).sort()).toEqual(
    ["extra.vikingHelmet", "shirt.midnight", "eyeColor.gold", "mouth.fangs"].sort(),
  );
});
