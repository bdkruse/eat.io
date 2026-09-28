import { z } from "zod";

// ---------- appearance ----------
// Each option list is the free values followed by the shop values. The FREE_*
// lists are the values anyone may wear; every other value is unlocked by exactly
// one shop item (see shop.ts).

// Light to dark. All free. The first six tones predate v5 and keep their values.
export const SKIN_TONES = [
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
] as const;
export const HAIR_STYLES = ["short", "bob", "curly", "ponytail", "buzz", "puffs"] as const;
export const PANTS_COLORS = ["#3f5a7a", "#b59a6d", "#444a52", "#6b7048"] as const;

export const FREE_HAIR_COLORS = ["#2b2220", "#3d2a1e", "#5a3825", "#8a3b1f", "#c4622d", "#d9b25f"] as const;
export const HAIR_COLORS = [
  ...FREE_HAIR_COLORS,
  "#1f6fff", // Electric Blue
  "#ff77c8", // Bubblegum Pink
  "#c9ccd1", // Silver
] as const;

export const FREE_SHIRT_COLORS = [
  "#d94f3d",
  "#4a7fa5",
  "#5f9e4a",
  "#e8a33d",
  "#7d5ba6",
  "#3e9c95",
  "#e07a9a",
  "#f4f1ea",
] as const;
export const SHIRT_COLORS = [
  ...FREE_SHIRT_COLORS,
  "#d4af37", // Gold
  "#b6ff3b", // Neon Lime
  "#1c2340", // Midnight
] as const;

export const FREE_ACCESSORIES = ["none", "glasses", "cap", "headband", "beanie"] as const;
export const ACCESSORIES = [
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
] as const;

export const FREE_EYE_SHAPES = ["round", "almond", "sleepy", "sparkly"] as const;
export const EYE_SHAPES = [...FREE_EYE_SHAPES, "star", "heart"] as const;

export const FREE_EYE_COLORS = [
  "#3b2417", // Dark Brown (the default)
  "#6b4226", // Brown
  "#8e7240", // Hazel
  "#4f8a4c", // Green
  "#4a78b5", // Blue
  "#7d868f", // Gray
] as const;
export const EYE_COLORS = [
  ...FREE_EYE_COLORS,
  "#8a4fd1", // Violet
  "#ffcc33", // Glowing Gold
] as const;

export const FREE_MOUTH_SHAPES = ["smile", "grin", "calm", "smirk"] as const;
export const MOUTH_SHAPES = [...FREE_MOUTH_SHAPES, "tongue", "fangs"] as const;

// Clothing. A dress (plain or sparkly) replaces the top and the bottom; overalls
// replace the bottom and sit over the top; the graphic shows only on a visible
// graphic tee. Each field is still stored and checked on its own.
export const FREE_TOPS = ["tee", "buttonUp", "graphicTee", "hoodie"] as const;
export const TOPS = [...FREE_TOPS, "catEarHoodie"] as const;
export const BOTTOMS = ["pants", "shorts", "skirt"] as const; // all free
export const FREE_ONE_PIECES = ["none", "dress", "overalls"] as const;
export const ONE_PIECES = [...FREE_ONE_PIECES, "sparklyDress"] as const;
export const FREE_GRAPHICS = ["star", "pizza", "lightning", "planet"] as const;
export const GRAPHICS = [...FREE_GRAPHICS, "rubberDuck", "dinosaur", "taco", "rainbow"] as const;

// The face fields default so a look stored before they existed (six fields, no
// face) still parses — as Round eyes, Dark Brown, and a Smile. The clothing
// fields default the same way, so a look stored before v5 parses as a tee,
// pants, no one-piece, and the star graphic.
export const AppearanceSchema = z.object({
  skinTone: z.enum(SKIN_TONES),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  shirtColor: z.enum(SHIRT_COLORS),
  pantsColor: z.enum(PANTS_COLORS),
  accessory: z.enum(ACCESSORIES),
  eyeShape: z.enum(EYE_SHAPES).default(FREE_EYE_SHAPES[0]),
  eyeColor: z.enum(EYE_COLORS).default(FREE_EYE_COLORS[0]),
  mouthShape: z.enum(MOUTH_SHAPES).default(FREE_MOUTH_SHAPES[0]),
  top: z.enum(TOPS).default(FREE_TOPS[0]),
  bottom: z.enum(BOTTOMS).default(BOTTOMS[0]),
  onePiece: z.enum(ONE_PIECES).default(FREE_ONE_PIECES[0]),
  graphic: z.enum(GRAPHICS).default(FREE_GRAPHICS[0]),
});
export type Appearance = z.infer<typeof AppearanceSchema>;
export type HairStyle = Appearance["hairStyle"];
export type Accessory = Appearance["accessory"];
export type EyeShape = Appearance["eyeShape"];
export type MouthShape = Appearance["mouthShape"];
export type Top = Appearance["top"];
export type Bottom = Appearance["bottom"];
export type OnePiece = Appearance["onePiece"];
export type Graphic = Appearance["graphic"];

// ---------- roles and permissions ----------

export const ROLES = ["player", "admin", "creator"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;
export const PERMISSIONS = ["admin.open", "settings.edit", "deck.edit", "shop.edit"] as const;
export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  player: [],
  admin: ["admin.open", "settings.edit"],
  creator: PERMISSIONS,
};
export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
export const ROLE_LABELS: Record<Role, string> = { player: "Player", admin: "Admin", creator: "Creator" };

// ---------- credentials ----------

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,14}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}
export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

// ---------- profile ----------

export const ProfileSchema = z.object({
  username: z.string(),
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
  appearance: AppearanceSchema.nullable(),
  pointsScored: z.number().int().nonnegative(),
  gamesPlayed: z.number().int().nonnegative(),
  gamesWon: z.number().int().nonnegative(),
  lunchMoney: z.number().int().nonnegative(),
  /** Shop item ids (see SHOP_ITEMS) this account has bought. */
  ownedItems: z.array(z.string()),
  createdAt: z.number().int(),
  lastLoginAt: z.number().int().nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const AccountErrorCodeSchema = z.enum([
  "INVALID_USERNAME",
  "INVALID_PASSWORD",
  "USERNAME_TAKEN",
  "BAD_CREDENTIALS",
  "WRONG_PASSWORD",
  "RATE_LIMITED",
  "NOT_LOGGED_IN",
  "BUSY",
  // appearanceSet: the look uses a shop item the player does not own.
  "NOT_OWNED",
  // shopBuy refusals.
  "NOT_AVAILABLE",
  "ALREADY_OWNED",
  "NOT_ENOUGH",
]);
export type AccountErrorCode = z.infer<typeof AccountErrorCodeSchema>;
