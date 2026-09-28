import {
  FREE_ACCESSORIES,
  FREE_EYE_COLORS,
  FREE_EYE_SHAPES,
  FREE_GRAPHICS,
  FREE_HAIR_COLORS,
  FREE_MOUTH_SHAPES,
  FREE_ONE_PIECES,
  FREE_SHIRT_COLORS,
  FREE_TOPS,
  SHOP_ITEMS,
  lockedItemsIn,
  type Appearance,
  type ShopItemKind,
} from "@eat.io/protocol";

/** The free value an item's field falls back to when the item is not owned. */
const FREE_FALLBACK_BY_KIND: Record<ShopItemKind, string> = {
  extra: FREE_ACCESSORIES[0],
  shirtColor: FREE_SHIRT_COLORS[0],
  hairColor: FREE_HAIR_COLORS[0],
  eyeShape: FREE_EYE_SHAPES[0],
  eyeColor: FREE_EYE_COLORS[0],
  mouthShape: FREE_MOUTH_SHAPES[0],
  top: FREE_TOPS[0],
  onePiece: FREE_ONE_PIECES[0],
  graphic: FREE_GRAPHICS[0],
};

/**
 * The look with every shop value the player does not own swapped for that field's first
 * free value, so the rest of the look is kept. A guest owns nothing. Unchanged (the same
 * object) when nothing is locked.
 */
export function withoutLockedItems(appearance: Appearance, ownedItemIds: readonly string[]): Appearance {
  const lockedItemIds = lockedItemsIn(appearance, ownedItemIds);
  if (lockedItemIds.length === 0) return appearance;
  const allowedLook: Appearance = { ...appearance };
  for (const item of SHOP_ITEMS) {
    if (!lockedItemIds.includes(item.id)) continue;
    Object.assign(allowedLook, { [item.unlocks.field]: FREE_FALLBACK_BY_KIND[item.kind] });
  }
  return allowedLook;
}
