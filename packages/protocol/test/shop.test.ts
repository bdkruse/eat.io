import { describe, expect, test } from "vitest";
import {
  SHOP_ITEMS,
  SHOP_PRICE_LIMITS,
  lockedItemsIn,
  shopConfigProblem,
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
  TOPS,
  BOTTOMS,
  ONE_PIECES,
  GRAPHICS,
  FREE_TOPS,
  FREE_ONE_PIECES,
  FREE_GRAPHICS,
  SHOP_ITEM_KINDS,
  SHOP_ITEM_KIND_FIELDS,
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

test("the shop catalog holds the 22 items of spec 13.2 and 13.3 and the 6 clothing items, with their default prices", () => {
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
    "top.catEarHoodie": 60,
    "onePiece.sparklyDress": 80,
    "graphic.rubberDuck": 30,
    "graphic.dinosaur": 40,
    "graphic.taco": 30,
    "graphic.rainbow": 50,
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
    "top.catEarHoodie": ["Cat-Ear Hoodie", "top"],
    "onePiece.sparklyDress": ["Sparkly Dress", "onePiece"],
    "graphic.rubberDuck": ["Rubber Duck Graphic", "graphic"],
    "graphic.dinosaur": ["Dinosaur Graphic", "graphic"],
    "graphic.taco": ["Taco Graphic", "graphic"],
    "graphic.rainbow": ["Rainbow Graphic", "graphic"],
  });
});

test("the clothing items come last, in catalog order", () => {
  expect(SHOP_ITEMS.slice(-6).map((item) => item.id)).toEqual([
    "top.catEarHoodie",
    "onePiece.sparklyDress",
    "graphic.rubberDuck",
    "graphic.dinosaur",
    "graphic.taco",
    "graphic.rainbow",
  ]);
});

test("the clothing kinds unlock the clothing field of the same name", () => {
  expect(SHOP_ITEM_KINDS).toEqual(expect.arrayContaining(["top", "onePiece", "graphic"]));
  expect(SHOP_ITEM_KIND_FIELDS.top).toBe("top");
  expect(SHOP_ITEM_KIND_FIELDS.onePiece).toBe("onePiece");
  expect(SHOP_ITEM_KIND_FIELDS.graphic).toBe("graphic");
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
    top: TOPS,
    onePiece: ONE_PIECES,
    graphic: GRAPHICS,
  };
  const freeOptionsByField: Record<string, readonly string[]> = {
    accessory: FREE_ACCESSORIES,
    shirtColor: FREE_SHIRT_COLORS,
    hairColor: FREE_HAIR_COLORS,
    eyeShape: FREE_EYE_SHAPES,
    eyeColor: FREE_EYE_COLORS,
    mouthShape: FREE_MOUTH_SHAPES,
    top: FREE_TOPS,
    onePiece: FREE_ONE_PIECES,
    graphic: FREE_GRAPHICS,
  };
  const fieldByKind = {
    extra: "accessory",
    shirtColor: "shirtColor",
    hairColor: "hairColor",
    eyeShape: "eyeShape",
    eyeColor: "eyeColor",
    mouthShape: "mouthShape",
    top: "top",
    onePiece: "onePiece",
    graphic: "graphic",
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
    ["top", TOPS, FREE_TOPS],
    ["bottom", BOTTOMS, BOTTOMS],
    ["onePiece", ONE_PIECES, FREE_ONE_PIECES],
    ["graphic", GRAPHICS, FREE_GRAPHICS],
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

test("lockedItemsIn names the cat-ear hoodie, the sparkly dress, and each shop graphic when unowned", () => {
  expect(lockedItemsIn({ ...FREE_LOOK, top: "catEarHoodie" }, [])).toEqual(["top.catEarHoodie"]);
  expect(lockedItemsIn({ ...FREE_LOOK, onePiece: "sparklyDress" }, [])).toEqual(["onePiece.sparklyDress"]);
  const shopGraphics: [Appearance["graphic"], string][] = [
    ["rubberDuck", "graphic.rubberDuck"],
    ["dinosaur", "graphic.dinosaur"],
    ["taco", "graphic.taco"],
    ["rainbow", "graphic.rainbow"],
  ];
  for (const [graphic, itemId] of shopGraphics) {
    expect(lockedItemsIn({ ...FREE_LOOK, graphic }, [])).toEqual([itemId]);
  }
});

test("lockedItemsIn names none of the clothing items when they are owned", () => {
  expect(lockedItemsIn({ ...FREE_LOOK, top: "catEarHoodie" }, ["top.catEarHoodie"])).toEqual([]);
  expect(lockedItemsIn({ ...FREE_LOOK, onePiece: "sparklyDress" }, ["onePiece.sparklyDress"])).toEqual([]);
  for (const graphic of ["rubberDuck", "dinosaur", "taco", "rainbow"] as const) {
    expect(lockedItemsIn({ ...FREE_LOOK, graphic }, [`graphic.${graphic}`])).toEqual([]);
  }
});

test("lockedItemsIn checks a shop graphic even when the top hides it", () => {
  const hiddenGraphicLook: Appearance = { ...FREE_LOOK, top: "hoodie", graphic: "dinosaur" };
  expect(lockedItemsIn(hiddenGraphicLook, [])).toEqual(["graphic.dinosaur"]);
});

test("lockedItemsIn a look of only free clothing is empty", () => {
  for (const top of FREE_TOPS) {
    for (const bottom of BOTTOMS) {
      for (const onePiece of FREE_ONE_PIECES) {
        for (const graphic of FREE_GRAPHICS) {
          expect(lockedItemsIn({ ...FREE_LOOK, top, bottom, onePiece, graphic }, [])).toEqual([]);
        }
      }
    }
  }
});

describe("shopConfigProblem", () => {
  const knownItemIds = SHOP_ITEMS.map((item) => item.id);

  test("a whole-number price inside the limits, a known id, and a boolean pass", () => {
    expect(
      shopConfigProblem(
        [
          { itemId: "extra.crown", price: SHOP_PRICE_LIMITS.min, available: true },
          { itemId: "shirt.gold", price: SHOP_PRICE_LIMITS.max, available: false },
        ],
        knownItemIds,
      ),
    ).toBeNull();
  });

  test("an empty list passes", () => {
    expect(shopConfigProblem([], knownItemIds)).toBeNull();
  });

  test.each([0, 1001, 12.5, -3, Number.NaN, Number.POSITIVE_INFINITY])("a price of %s is refused", (price) => {
    const problem = shopConfigProblem([{ itemId: "extra.crown", price, available: true }], knownItemIds);
    expect(problem).toContain("extra.crown");
    expect(problem).toContain("1 and 1000");
  });

  test("an unknown item id is refused", () => {
    expect(shopConfigProblem([{ itemId: "extra.jetpack", price: 50, available: true }], knownItemIds)).toBe(
      '"extra.jetpack" is not a known shop item.',
    );
  });

  test("an item listed twice is refused", () => {
    expect(
      shopConfigProblem(
        [
          { itemId: "extra.crown", price: 50, available: true },
          { itemId: "extra.crown", price: 60, available: false },
        ],
        knownItemIds,
      ),
    ).toBe('"extra.crown" is listed more than once.');
  });

  test("a non-boolean available is refused", () => {
    const notABoolean = "yes" as unknown as boolean;
    expect(
      shopConfigProblem([{ itemId: "extra.crown", price: 50, available: notABoolean }], knownItemIds),
    ).toBe('Available for "extra.crown" must be true or false.');
  });
});
