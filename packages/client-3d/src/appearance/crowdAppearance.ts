import { SHOP_ITEMS, SKIN_TONES, type ShopItemDefinition } from "@eat.io/protocol";
import { createRandom, hashString, type SeededRandom } from "../lib/seededRandom.js";
import { randomAppearance, visibleClothing, type Appearance, type Bottom, type OnePiece, type Top } from "./appearance.js";

/**
 * The cafeteria crowd's looks (§7). Scenery, not players: a crowd kid may wear any shop
 * item, and nobody checks ownership. Every crowd kid in the scene has its own index (see
 * `scene/cafeteria/layout.ts`), so the room looks the same on every visit.
 */

/** Light and dark tones alternate, so neighbours in the index space never match. Any 10
 *  consecutive indices use every tone once, and any stretch from 0 is spread evenly. */
const TONE_ORDER = [0, 5, 2, 7, 4, 9, 1, 6, 3, 8] as const;

/** One kid in this many wears only free values; the other three wear a shop item. */
const FREE_KID_EVERY = 4;

/**
 * The clothing a kid must wear so that every value shows up. A field set here is pinned:
 * the random draw and the shop items leave it alone. An empty outfit is all random.
 */
interface CrowdOutfit {
  top?: Top;
  bottom?: Bottom;
  onePiece?: OnePiece;
}

/** Each block of this many indices holds every outfit below exactly once, shuffled. Any
 *  40 consecutive indices contain a whole block, so they see every clothing value. */
const OUTFIT_BLOCK_SIZE = 20;

/** Worn by the free-only kids of a block (one in four of its indices): every free top,
 *  bottom, and one-piece, each where it shows. */
const FREE_KID_OUTFITS: readonly CrowdOutfit[] = [
  { onePiece: "none", top: "tee", bottom: "pants" },
  { onePiece: "none", top: "buttonUp", bottom: "shorts" },
  { onePiece: "none", top: "graphicTee", bottom: "skirt" },
  { onePiece: "dress" },
  { onePiece: "overalls", top: "hoodie" },
];

/** Worn by the shop kids of a block: the two shop clothing values, then random outfits.
 *  Most of those keep a separate top and bottom, so the pinned dresses and overalls, and
 *  the random draw's own, stay the seasoning they are in `randomAppearance`. */
const SHOP_KID_OUTFITS: readonly CrowdOutfit[] = [
  { onePiece: "sparklyDress" },
  { onePiece: "none", top: "catEarHoodie" },
  ...Array.from({ length: 8 }, (): CrowdOutfit => ({ onePiece: "none" })),
  ...Array.from({ length: 5 }, (): CrowdOutfit => ({})),
];

/** The chance a shop kid wears a second shop item. */
const SECOND_ITEM_CHANCE = 0.35;

function shuffled<Item>(items: readonly Item[], random: SeededRandom): Item[] {
  const order = [...items];
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random.next() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex]!, order[index]!];
  }
  return order;
}

function isFreeKid(crowdIndex: number): boolean {
  return crowdIndex % FREE_KID_EVERY === FREE_KID_EVERY - 1;
}

/** This index's outfit: its place among its block's free or shop kids, in the block's own
 *  shuffled order. */
function outfitFor(crowdIndex: number): CrowdOutfit {
  const blockIndex = Math.floor(crowdIndex / OUTFIT_BLOCK_SIZE);
  const positionInBlock = crowdIndex % OUTFIT_BLOCK_SIZE;
  const groupIndex = Math.floor(positionInBlock / FREE_KID_EVERY);
  const blockRandom = createRandom(hashString(`crowd:outfits:${blockIndex}`));
  const freeKidOutfits = shuffled(FREE_KID_OUTFITS, blockRandom);
  const shopKidOutfits = shuffled(SHOP_KID_OUTFITS, blockRandom);
  if (isFreeKid(crowdIndex)) return freeKidOutfits[groupIndex]!;
  return shopKidOutfits[groupIndex * (FREE_KID_EVERY - 1) + (positionInBlock % FREE_KID_EVERY)]!;
}

/** The shop items that show on this look: a covered top, or a graphic off a visible
 *  graphic T, does not count. */
function visibleShopItemIds(look: Appearance): string[] {
  const clothing = visibleClothing(look);
  return SHOP_ITEMS.filter((item) => {
    if (look[item.unlocks.field] !== item.unlocks.value) return false;
    if (item.unlocks.field === "top") return clothing.top === item.unlocks.value;
    if (item.unlocks.field === "graphic") return clothing.graphic === item.unlocks.value;
    return true;
  }).map((item) => item.id);
}

/** The look with this item worn. A graphic comes on a graphic T, unless the top is pinned. */
function wearing(look: Appearance, item: ShopItemDefinition, outfit: CrowdOutfit): Appearance {
  const withItem = { ...look, [item.unlocks.field]: item.unlocks.value } as Appearance;
  if (item.unlocks.field === "graphic" && outfit.top === undefined) return { ...withItem, top: "graphicTee" };
  return withItem;
}

/** Puts on a random new shop item that shows and hides none already worn. The items on a
 *  pinned field are left out, so the outfit keeps its place in the block. */
function withShopItem(look: Appearance, outfit: CrowdOutfit, random: SeededRandom): Appearance {
  const shownBefore = visibleShopItemIds(look);
  const candidates = SHOP_ITEMS.filter((item) => {
    if (outfit[item.unlocks.field as keyof CrowdOutfit] !== undefined || shownBefore.includes(item.id)) return false;
    const shownAfter = visibleShopItemIds(wearing(look, item, outfit));
    return shownAfter.includes(item.id) && shownBefore.every((itemId) => shownAfter.includes(itemId));
  });
  return candidates.length === 0 ? look : wearing(look, random.pick(candidates), outfit);
}

/**
 * The look of the crowd kid at this index, a non-negative integer. The skin tone follows
 * a fixed order; the clothing follows the index's block, so every top, bottom, and
 * one-piece value shows within any 40 consecutive kids; everything else is a seeded
 * draw of free values. Three in four kids (by index, so exactly 75 of any 100 in a row)
 * then put on one shop item from the full catalog, and some a second.
 */
export function crowdAppearance(crowdIndex: number): Appearance {
  const outfit = outfitFor(crowdIndex);
  let look: Appearance = {
    ...randomAppearance(hashString(`crowd:${crowdIndex}`)),
    ...outfit,
    skinTone: SKIN_TONES[TONE_ORDER[crowdIndex % TONE_ORDER.length]!],
  };
  if (isFreeKid(crowdIndex)) return look;
  const shopRandom = createRandom(hashString(`crowd:shop:${crowdIndex}`));
  look = withShopItem(look, outfit, shopRandom);
  if (shopRandom.chance(SECOND_ITEM_CHANCE)) look = withShopItem(look, outfit, shopRandom);
  return look;
}
