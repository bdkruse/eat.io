import {
  ACCESSORIES,
  BOTTOMS,
  EYE_COLORS,
  EYE_SHAPES,
  FREE_ACCESSORIES,
  FREE_EYE_COLORS,
  FREE_EYE_SHAPES,
  FREE_GRAPHICS,
  FREE_HAIR_COLORS,
  FREE_MOUTH_SHAPES,
  FREE_ONE_PIECES,
  FREE_SHIRT_COLORS,
  FREE_TOPS,
  GRAPHICS,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_SHAPES,
  ONE_PIECES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOP_ITEMS,
  SKIN_TONES,
  TOPS,
  lockedItemsIn,
  type Accessory,
  type Appearance,
  type Bottom,
  type EyeShape,
  type Graphic,
  type HairStyle,
  type MouthShape,
  type OnePiece,
  type ShopItemKind,
  type Top,
} from "@eat.io/protocol";
import { createRandom, hashString } from "../lib/seededRandom.js";

// The option lists and the Appearance shape are the protocol's to define (the server
// validates against the very same schema) — this module re-exports them so the rest of
// the client keeps importing appearance concerns from one place.
export {
  ACCESSORIES,
  BOTTOMS,
  EYE_COLORS,
  EYE_SHAPES,
  GRAPHICS,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_SHAPES,
  ONE_PIECES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  TOPS,
};
export type { Accessory, Appearance, Bottom, EyeShape, Graphic, HairStyle, MouthShape, OnePiece, Top };

/** What the player starts as before touching the customize screen. */
export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: SKIN_TONES[1],
  hairStyle: "short",
  hairColor: HAIR_COLORS[2],
  shirtColor: SHIRT_COLORS[0],
  pantsColor: PANTS_COLORS[0],
  accessory: "none",
  eyeShape: FREE_EYE_SHAPES[0],
  eyeColor: FREE_EYE_COLORS[0],
  mouthShape: FREE_MOUTH_SHAPES[0],
  top: "tee",
  bottom: "pants",
  onePiece: "none",
  graphic: "star",
};

/**
 * A generated kid — the crowd, and the Customize screen's shuffle. Free values only, so
 * nobody in the room is seen wearing a shop item they never bought. Each newer group of
 * fields is drawn after the older ones — the face, then the clothing — so a seed keeps
 * the look it had before those fields existed.
 */
export function randomAppearance(seed: number): Appearance {
  const random = createRandom(seed);
  return {
    skinTone: random.pick(SKIN_TONES),
    hairStyle: random.pick(HAIR_STYLES),
    hairColor: random.pick(FREE_HAIR_COLORS),
    shirtColor: random.pick(FREE_SHIRT_COLORS),
    pantsColor: random.pick(PANTS_COLORS),
    // Most kids wear nothing extra, so accessories stay a detail rather than a uniform.
    accessory: random.chance(0.55) ? "none" : random.pick(FREE_ACCESSORIES.slice(1)),
    // Round eyes and a smile are the usual; the other shapes season the crowd.
    eyeShape: random.chance(0.5) ? FREE_EYE_SHAPES[0] : random.pick(FREE_EYE_SHAPES.slice(1)),
    eyeColor: random.pick(FREE_EYE_COLORS),
    mouthShape: random.chance(0.5) ? FREE_MOUTH_SHAPES[0] : random.pick(FREE_MOUTH_SHAPES.slice(1)),
    top: random.pick(FREE_TOPS),
    bottom: random.pick(BOTTOMS),
    // Most kids wear a separate top and bottom; dresses and overalls season the crowd.
    onePiece: random.chance(0.6) ? FREE_ONE_PIECES[0] : random.pick(FREE_ONE_PIECES.slice(1)),
    graphic: random.pick(FREE_GRAPHICS),
  };
}

/**
 * The opponent's look is not on the wire for a guest (customization is local only), so it
 * is derived from their name — the same opponent always looks the same. A logged-in
 * opponent's saved appearance takes precedence over this (§11), decided by the caller.
 */
export function appearanceFromName(name: string): Appearance {
  return randomAppearance(hashString(`opponent:${name}`));
}

/** The free value a field falls back to when its shop value is not owned — the same
 *  fallback the server applies to a session look on logout. */
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

/** What the kid model draws of a look's clothing. `null` means that piece is covered. */
export interface VisibleClothing {
  top: Top | null;
  bottom: Bottom | null;
  onePiece: OnePiece;
  graphic: Graphic | null;
}

/**
 * Which pieces of a look show (§6.2). A dress, plain or sparkly, covers the top and the
 * bottom; overalls cover the bottom and are worn over the top; the graphic shows only on
 * a graphic T that is itself visible. The covered fields stay stored in the look, so
 * taking the dress off brings them back.
 */
export function visibleClothing(look: Appearance): VisibleClothing {
  const wearingDress = look.onePiece === "dress" || look.onePiece === "sparklyDress";
  const top = wearingDress ? null : look.top;
  const bottom = wearingDress || look.onePiece === "overalls" ? null : look.bottom;
  const graphic = top === "graphicTee" ? look.graphic : null;
  return { top, bottom, onePiece: look.onePiece, graphic };
}

/** The look with this shop item worn: only the one field it unlocks changes. An unknown
 *  item id leaves the look (the same object) as it is. */
export function wearingShopItem(appearance: Appearance, itemId: string): Appearance {
  const item = SHOP_ITEMS.find((shopItem) => shopItem.id === itemId);
  if (!item) return appearance;
  // The catalog pairs each field with values from that field's own option list.
  return { ...appearance, [item.unlocks.field]: item.unlocks.value } as Appearance;
}

/**
 * The look with every shop value the player does not own swapped for that field's first
 * free value, keeping the rest. A guest owns nothing. Unchanged (the same object) when
 * nothing is locked. Mirrors the server's own rule for a session look on logout, which it
 * applies without telling the client (§13.4).
 */
export function withoutLockedItems(appearance: Appearance, ownedItemIds: readonly string[]): Appearance {
  const lockedItemIds = lockedItemsIn(appearance, ownedItemIds);
  if (lockedItemIds.length === 0) return appearance;
  let allowedLook: Appearance = appearance;
  for (const item of SHOP_ITEMS) {
    if (!lockedItemIds.includes(item.id)) continue;
    allowedLook = { ...allowedLook, [item.unlocks.field]: FREE_FALLBACK_BY_KIND[item.kind] } as Appearance;
  }
  return allowedLook;
}
