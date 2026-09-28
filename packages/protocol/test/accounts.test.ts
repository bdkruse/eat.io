import { expect, test } from "vitest";
import {
  isValidUsername,
  isValidPassword,
  permissionsFor,
  PERMISSIONS,
  AppearanceSchema,
  ProfileSchema,
  AccountErrorCodeSchema,
  AdminErrorCodeSchema,
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
  SKIN_TONES,
  TOPS,
  BOTTOMS,
  ONE_PIECES,
  GRAPHICS,
  FREE_TOPS,
  FREE_ONE_PIECES,
  FREE_GRAPHICS,
} from "../src/index.js";

test("isValidUsername accepts letters, digits, underscore, and hyphen within 3-14 chars", () => {
  expect(isValidUsername("Bain")).toBe(true);
  expect(isValidUsername("a_b-c")).toBe(true);
  expect(isValidUsername("abc")).toBe(true); // 3 chars, the floor
  expect(isValidUsername("abcdefghijklmn")).toBe(true); // 14 chars, the ceiling
});

test("isValidUsername rejects too short, too long, spaces, symbols, and empty", () => {
  expect(isValidUsername("ab")).toBe(false); // 2 chars
  expect(isValidUsername("abcdefghijklmno")).toBe(false); // 15 chars
  expect(isValidUsername("a b")).toBe(false);
  expect(isValidUsername("a@b")).toBe(false);
  expect(isValidUsername("")).toBe(false);
});

test("isValidPassword accepts 8 and 128 characters", () => {
  expect(isValidPassword("a".repeat(8))).toBe(true);
  expect(isValidPassword("a".repeat(128))).toBe(true);
});

test("isValidPassword rejects 7 and 129 characters", () => {
  expect(isValidPassword("a".repeat(7))).toBe(false);
  expect(isValidPassword("a".repeat(129))).toBe(false);
});

test("permissionsFor maps each role to its permissions", () => {
  expect(permissionsFor("creator")).toEqual([...PERMISSIONS]);
  expect(permissionsFor("player")).toEqual([]);
  expect(permissionsFor("admin")).toContain("admin.open");
});

test("admin gets settings.edit but not deck.edit or shop.edit; creator gets all four permissions", () => {
  const adminPermissions = permissionsFor("admin");
  expect(adminPermissions).toContain("admin.open");
  expect(adminPermissions).toContain("settings.edit");
  expect(adminPermissions).not.toContain("deck.edit");
  expect(adminPermissions).not.toContain("shop.edit");

  expect(permissionsFor("creator")).toEqual(["admin.open", "settings.edit", "deck.edit", "shop.edit"]);
});

test("AppearanceSchema accepts a valid look and rejects an out-of-palette color", () => {
  const validAppearance = {
    skinTone: "#eec19b",
    hairStyle: "bob",
    hairColor: "#5a3825",
    shirtColor: "#4a7fa5",
    pantsColor: "#3f5a7a",
    accessory: "glasses",
    eyeShape: "sleepy",
    eyeColor: FREE_EYE_COLORS[4],
    mouthShape: "smirk",
    top: "graphicTee",
    bottom: "skirt",
    onePiece: "overalls",
    graphic: "planet",
  };
  expect(AppearanceSchema.parse(validAppearance)).toEqual(validAppearance);
  expect(() =>
    AppearanceSchema.parse({ ...validAppearance, skinTone: "#000000" }),
  ).toThrow();
});

test("an appearance stored before the face fields existed parses with every default", () => {
  // The exact shape a v3 server saved to the accounts table: six fields, no face.
  const storedBeforeFaces = JSON.parse(
    '{"skinTone":"#d9a47a","hairStyle":"puffs","hairColor":"#c4622d","shirtColor":"#7d5ba6","pantsColor":"#6b7048","accessory":"beanie"}',
  );
  expect(AppearanceSchema.parse(storedBeforeFaces)).toEqual({
    skinTone: "#d9a47a",
    hairStyle: "puffs",
    hairColor: "#c4622d",
    shirtColor: "#7d5ba6",
    pantsColor: "#6b7048",
    accessory: "beanie",
    eyeShape: "round",
    eyeColor: FREE_EYE_COLORS[0],
    mouthShape: "smile",
    top: "tee",
    bottom: "pants",
    onePiece: "none",
    graphic: "star",
  });
});

test("an appearance stored before the clothing fields existed parses as a tee, pants, no one-piece, and a star", () => {
  // The exact shape a v4 server saved to the accounts table: nine fields, a face, no clothing.
  const storedBeforeClothing = JSON.parse(
    '{"skinTone":"#5e3a24","hairStyle":"bob","hairColor":"#1f6fff","shirtColor":"#d4af37","pantsColor":"#444a52","accessory":"crown","eyeShape":"heart","eyeColor":"#8a4fd1","mouthShape":"fangs"}',
  );
  expect(AppearanceSchema.parse(storedBeforeClothing)).toEqual({
    skinTone: "#5e3a24",
    hairStyle: "bob",
    hairColor: "#1f6fff",
    shirtColor: "#d4af37",
    pantsColor: "#444a52",
    accessory: "crown",
    eyeShape: "heart",
    eyeColor: "#8a4fd1",
    mouthShape: "fangs",
    top: "tee",
    bottom: "pants",
    onePiece: "none",
    graphic: "star",
  });
});

test("the clothing defaults are the first value of each clothing list", () => {
  expect(FREE_TOPS[0]).toBe("tee");
  expect(BOTTOMS[0]).toBe("pants");
  expect(FREE_ONE_PIECES[0]).toBe("none");
  expect(FREE_GRAPHICS[0]).toBe("star");
});

test("the clothing lists are the free values followed by the shop values", () => {
  expect(FREE_TOPS).toEqual(["tee", "buttonUp", "graphicTee", "hoodie"]);
  expect(TOPS).toEqual([...FREE_TOPS, "catEarHoodie"]);
  expect(BOTTOMS).toEqual(["pants", "shorts", "skirt"]);
  expect(FREE_ONE_PIECES).toEqual(["none", "dress", "overalls"]);
  expect(ONE_PIECES).toEqual([...FREE_ONE_PIECES, "sparklyDress"]);
  expect(FREE_GRAPHICS).toEqual(["star", "pizza", "lightning", "planet"]);
  expect(GRAPHICS).toEqual([...FREE_GRAPHICS, "rubberDuck", "dinosaur", "taco", "rainbow"]);
});

test("every clothing value parses, including the shop values", () => {
  const clothingLook = AppearanceSchema.parse({
    skinTone: "#eec19b",
    hairStyle: "bob",
    hairColor: "#5a3825",
    shirtColor: "#4a7fa5",
    pantsColor: "#3f5a7a",
    accessory: "none",
  });
  for (const top of TOPS) expect(AppearanceSchema.parse({ ...clothingLook, top }).top).toBe(top);
  for (const bottom of BOTTOMS) expect(AppearanceSchema.parse({ ...clothingLook, bottom }).bottom).toBe(bottom);
  for (const onePiece of ONE_PIECES) {
    expect(AppearanceSchema.parse({ ...clothingLook, onePiece }).onePiece).toBe(onePiece);
  }
  for (const graphic of GRAPHICS) expect(AppearanceSchema.parse({ ...clothingLook, graphic }).graphic).toBe(graphic);
});

test("AppearanceSchema rejects an unknown clothing value", () => {
  const unclothed = {
    skinTone: "#eec19b",
    hairStyle: "bob",
    hairColor: "#5a3825",
    shirtColor: "#4a7fa5",
    pantsColor: "#3f5a7a",
    accessory: "none",
  };
  expect(() => AppearanceSchema.parse({ ...unclothed, top: "tankTop" })).toThrow();
  expect(() => AppearanceSchema.parse({ ...unclothed, bottom: "jeans" })).toThrow();
  expect(() => AppearanceSchema.parse({ ...unclothed, onePiece: "jumpsuit" })).toThrow();
  expect(() => AppearanceSchema.parse({ ...unclothed, graphic: "skull" })).toThrow();
});

test("the ten skin tones run light to dark, keep the original six, and all parse", () => {
  expect(SKIN_TONES).toEqual([
    "#f6d7bf",
    "#eec19b",
    "#e2b087",
    "#d9a47a",
    "#c68b5e",
    "#b87a4f",
    "#9f6641",
    "#8d5634",
    "#5e3a24",
    "#3f2618",
  ]);
  for (const originalTone of ["#f6d7bf", "#eec19b", "#d9a47a", "#b87a4f", "#8d5634", "#5e3a24"]) {
    expect(SKIN_TONES).toContain(originalTone);
  }
  const lookWithoutSkinTone = {
    hairStyle: "bob",
    hairColor: "#5a3825",
    shirtColor: "#4a7fa5",
    pantsColor: "#3f5a7a",
    accessory: "none",
  };
  for (const skinTone of SKIN_TONES) {
    expect(AppearanceSchema.parse({ ...lookWithoutSkinTone, skinTone }).skinTone).toBe(skinTone);
  }
});

test("the face defaults are the first free value of each face list", () => {
  expect(FREE_EYE_SHAPES[0]).toBe("round");
  expect(FREE_MOUTH_SHAPES[0]).toBe("smile");
  expect(FREE_EYE_SHAPES).toEqual(["round", "almond", "sleepy", "sparkly"]);
  expect(FREE_MOUTH_SHAPES).toEqual(["smile", "grin", "calm", "smirk"]);
  expect(FREE_EYE_COLORS).toHaveLength(6);
});

test("AppearanceSchema rejects an unknown face value", () => {
  const faceless = {
    skinTone: "#eec19b",
    hairStyle: "bob",
    hairColor: "#5a3825",
    shirtColor: "#4a7fa5",
    pantsColor: "#3f5a7a",
    accessory: "none",
  };
  expect(() => AppearanceSchema.parse({ ...faceless, eyeShape: "square" })).toThrow();
  expect(() => AppearanceSchema.parse({ ...faceless, eyeColor: "#000000" })).toThrow();
  expect(() => AppearanceSchema.parse({ ...faceless, mouthShape: "frown" })).toThrow();
});

test("the free option lists are today's values, and the full lists add only the shop values", () => {
  expect(FREE_ACCESSORIES).toEqual(["none", "glasses", "cap", "headband", "beanie"]);
  expect(FREE_SHIRT_COLORS).toEqual(["#d94f3d", "#4a7fa5", "#5f9e4a", "#e8a33d", "#7d5ba6", "#3e9c95", "#e07a9a", "#f4f1ea"]);
  expect(FREE_HAIR_COLORS).toEqual(["#2b2220", "#3d2a1e", "#5a3825", "#8a3b1f", "#c4622d", "#d9b25f"]);

  expect(ACCESSORIES).toEqual([
    ...FREE_ACCESSORIES,
    "sunglasses",
    "bowTie",
    "headphones",
    "chefHat",
    "crown",
    "propellerCap",
    "trafficCone",
    "vikingHelmet",
    "alienAntennae",
    "bananaHat",
  ]);
  expect(SHIRT_COLORS.slice(0, FREE_SHIRT_COLORS.length)).toEqual([...FREE_SHIRT_COLORS]);
  expect(SHIRT_COLORS).toHaveLength(FREE_SHIRT_COLORS.length + 3);
  expect(HAIR_COLORS.slice(0, FREE_HAIR_COLORS.length)).toEqual([...FREE_HAIR_COLORS]);
  expect(HAIR_COLORS).toHaveLength(FREE_HAIR_COLORS.length + 3);
  expect(EYE_SHAPES).toEqual([...FREE_EYE_SHAPES, "star", "heart"]);
  expect(EYE_COLORS.slice(0, FREE_EYE_COLORS.length)).toEqual([...FREE_EYE_COLORS]);
  expect(EYE_COLORS).toHaveLength(FREE_EYE_COLORS.length + 2);
  expect(MOUTH_SHAPES).toEqual([...FREE_MOUTH_SHAPES, "tongue", "fangs"]);
});

test("color option values are distinct lowercase hex strings", () => {
  for (const colorList of [SKIN_TONES, SHIRT_COLORS, HAIR_COLORS, EYE_COLORS]) {
    expect(new Set(colorList).size).toBe(colorList.length);
    for (const colorValue of colorList) expect(colorValue).toMatch(/^#[0-9a-f]{6}$/);
  }
});

test("ProfileSchema requires lunchMoney as a non-negative whole number and ownedItems as strings", () => {
  const profile = {
    username: "Riley",
    role: "player",
    permissions: [],
    appearance: null,
    pointsScored: 12,
    gamesPlayed: 2,
    gamesWon: 1,
    lunchMoney: 12,
    ownedItems: ["extra.crown"],
    createdAt: 1700000000000,
    lastLoginAt: null,
  };
  expect(ProfileSchema.parse(profile)).toEqual(profile);
  expect(() => ProfileSchema.parse({ ...profile, lunchMoney: -1 })).toThrow();
  expect(() => ProfileSchema.parse({ ...profile, lunchMoney: 1.5 })).toThrow();
  const { lunchMoney: _lunchMoney, ...profileWithoutLunchMoney } = profile;
  expect(() => ProfileSchema.parse(profileWithoutLunchMoney)).toThrow();
  const { ownedItems: _ownedItems, ...profileWithoutOwnedItems } = profile;
  expect(() => ProfileSchema.parse(profileWithoutOwnedItems)).toThrow();
});

test("account error codes include the shop and ownership codes, admin codes include INVALID_SHOP", () => {
  for (const code of ["NOT_OWNED", "NOT_AVAILABLE", "ALREADY_OWNED", "NOT_ENOUGH"]) {
    expect(AccountErrorCodeSchema.options).toContain(code);
  }
  expect(AdminErrorCodeSchema.options).toContain("INVALID_SHOP");
});
