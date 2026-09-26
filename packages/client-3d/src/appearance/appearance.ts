import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type Accessory,
  type Appearance,
  type HairStyle,
} from "@eat.io/protocol";
import { createRandom, hashString } from "../lib/seededRandom.js";

// The option lists and the Appearance shape are the protocol's to define (the server
// validates against the very same schema) — this module re-exports them so the rest of
// the client keeps importing appearance concerns from one place.
export { ACCESSORIES, HAIR_COLORS, HAIR_STYLES, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES };
export type { Accessory, Appearance, HairStyle };

/** What the player starts as before touching the customize screen. */
export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: SKIN_TONES[1],
  hairStyle: "short",
  hairColor: HAIR_COLORS[2],
  shirtColor: SHIRT_COLORS[0],
  pantsColor: PANTS_COLORS[0],
  accessory: "none",
};

export function randomAppearance(seed: number): Appearance {
  const random = createRandom(seed);
  return {
    skinTone: random.pick(SKIN_TONES),
    hairStyle: random.pick(HAIR_STYLES),
    hairColor: random.pick(HAIR_COLORS),
    shirtColor: random.pick(SHIRT_COLORS),
    pantsColor: random.pick(PANTS_COLORS),
    // Most kids wear nothing extra, so accessories stay a detail rather than a uniform.
    accessory: random.chance(0.55) ? "none" : random.pick(ACCESSORIES.slice(1)),
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
