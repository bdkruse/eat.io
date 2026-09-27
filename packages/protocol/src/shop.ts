import { z } from "zod";
import type { Appearance } from "./accounts.js";

// ---------- limits ----------

export const SHOP_PRICE_LIMITS = { min: 1, max: 1000 } as const;

// ---------- items ----------

export const SHOP_ITEM_KINDS = ["extra", "shirtColor", "hairColor", "eyeShape", "eyeColor", "mouthShape"] as const;
export const ShopItemKindSchema = z.enum(SHOP_ITEM_KINDS);
export type ShopItemKind = z.infer<typeof ShopItemKindSchema>;

/** The appearance field each kind of item unlocks a value of. */
export const SHOP_ITEM_KIND_FIELDS: Record<ShopItemKind, keyof Appearance> = {
  extra: "accessory",
  shirtColor: "shirtColor",
  hairColor: "hairColor",
  eyeShape: "eyeShape",
  eyeColor: "eyeColor",
  mouthShape: "mouthShape",
};

/** A catalog entry, like a card. The Creator's saved price and availability
 *  override `defaultPrice` (the item is available unless turned off). */
export interface ShopItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: ShopItemKind;
  readonly unlocks: { readonly field: keyof Appearance; readonly value: string };
  readonly defaultPrice: number;
}

function shopItem(
  id: string,
  name: string,
  kind: ShopItemKind,
  unlockedValue: string,
  defaultPrice: number,
): ShopItemDefinition {
  return { id, name, kind, unlocks: { field: SHOP_ITEM_KIND_FIELDS[kind], value: unlockedValue }, defaultPrice };
}

// Spec §13.2 and §13.3. The unlocked values are the non-free entries of the
// appearance option lists in accounts.ts.
export const SHOP_ITEMS: readonly ShopItemDefinition[] = [
  shopItem("extra.sunglasses", "Sunglasses", "extra", "sunglasses", 30),
  shopItem("extra.bowTie", "Bow Tie", "extra", "bowTie", 30),
  shopItem("extra.headphones", "Headphones", "extra", "headphones", 40),
  shopItem("extra.chefHat", "Chef Hat", "extra", "chefHat", 50),
  shopItem("extra.crown", "Crown", "extra", "crown", 100),
  shopItem("extra.propellerCap", "Propeller Cap", "extra", "propellerCap", 60),
  shopItem("extra.trafficCone", "Traffic Cone Hat", "extra", "trafficCone", 70),
  shopItem("extra.vikingHelmet", "Viking Helmet", "extra", "vikingHelmet", 80),
  shopItem("extra.alienAntennae", "Alien Antennae", "extra", "alienAntennae", 60),
  shopItem("extra.bananaHat", "Banana Hat", "extra", "bananaHat", 90),
  shopItem("shirt.gold", "Gold Shirt", "shirtColor", "#d4af37", 100),
  shopItem("shirt.neonLime", "Neon Lime Shirt", "shirtColor", "#b6ff3b", 40),
  shopItem("shirt.midnight", "Midnight Shirt", "shirtColor", "#1c2340", 30),
  shopItem("hair.electricBlue", "Electric Blue Hair", "hairColor", "#1f6fff", 50),
  shopItem("hair.bubblegum", "Bubblegum Pink Hair", "hairColor", "#ff77c8", 50),
  shopItem("hair.silver", "Silver Hair", "hairColor", "#c9ccd1", 40),
  shopItem("eyes.star", "Star Eyes", "eyeShape", "star", 60),
  shopItem("eyes.heart", "Heart Eyes", "eyeShape", "heart", 60),
  shopItem("eyeColor.violet", "Violet", "eyeColor", "#8a4fd1", 40),
  shopItem("eyeColor.gold", "Glowing Gold", "eyeColor", "#ffcc33", 80),
  shopItem("mouth.tongue", "Tongue Out", "mouthShape", "tongue", 50),
  shopItem("mouth.fangs", "Vampire Fangs", "mouthShape", "fangs", 70),
];

/** The shop item ids this look uses that the player does not own. Empty means
 *  the look is allowed. A guest owns nothing, so pass an empty list. */
export function lockedItemsIn(appearance: Appearance, ownedItemIds: readonly string[]): string[] {
  return SHOP_ITEMS.filter(
    (item) => appearance[item.unlocks.field] === item.unlocks.value && !ownedItemIds.includes(item.id),
  ).map((item) => item.id);
}

// ---------- wire shapes ----------

/** One shop item as the server sends it, with the Creator's price and
 *  availability applied and whether the receiving player owns it. */
export const ShopItemViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ShopItemKindSchema,
  price: z.number().int(),
  available: z.boolean(),
  owned: z.boolean(),
});
export type ShopItemView = z.infer<typeof ShopItemViewSchema>;

/** One row of a `shopConfigSave`. `price` is a loose number on purpose, like
 *  `settingsSave`: the server answers `adminError` `INVALID_SHOP` with a
 *  specific message rather than a generic `BAD_MESSAGE`. */
export const ShopConfigEntrySchema = z.object({
  itemId: z.string().max(64),
  price: z.number(),
  available: z.boolean(),
});
export type ShopConfigEntry = z.infer<typeof ShopConfigEntrySchema>;

/** null when valid, else a message. knownItemIds: the catalog ids (SHOP_ITEMS). */
export function shopConfigProblem(entries: readonly ShopConfigEntry[], knownItemIds: readonly string[]): string | null {
  const seenItemIds = new Set<string>();
  for (const entry of entries) {
    if (!knownItemIds.includes(entry.itemId)) {
      return `"${entry.itemId}" is not a known shop item.`;
    }
    if (seenItemIds.has(entry.itemId)) {
      return `"${entry.itemId}" is listed more than once.`;
    }
    seenItemIds.add(entry.itemId);
    if (!Number.isInteger(entry.price) || entry.price < SHOP_PRICE_LIMITS.min || entry.price > SHOP_PRICE_LIMITS.max) {
      return `The price of "${entry.itemId}" must be a whole number between ${SHOP_PRICE_LIMITS.min} and ${SHOP_PRICE_LIMITS.max}.`;
    }
    if (typeof entry.available !== "boolean") {
      return `Available for "${entry.itemId}" must be true or false.`;
    }
  }
  return null;
}
