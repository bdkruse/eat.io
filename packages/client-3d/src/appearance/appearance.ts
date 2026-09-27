import {
  ACCESSORIES,
  EYE_COLORS,
  EYE_SHAPES,
  FREE_ACCESSORIES,
  FREE_EYE_COLORS,
  FREE_EYE_SHAPES,
  FREE_HAIR_COLORS,
  FREE_MOUTH_SHAPES,
  FREE_SHIRT_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_SHAPES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type Accessory,
  type Appearance,
  type EyeShape,
  type HairStyle,
  type MouthShape,
} from "@eat.io/protocol";
import { createRandom, hashString } from "../lib/seededRandom.js";

// The option lists and the Appearance shape are the protocol's to define (the server
// validates against the very same schema) — this module re-exports them so the rest of
// the client keeps importing appearance concerns from one place.
export { ACCESSORIES, EYE_COLORS, EYE_SHAPES, HAIR_COLORS, HAIR_STYLES, MOUTH_SHAPES, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES };
export type { Accessory, Appearance, EyeShape, HairStyle, MouthShape };

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
};

/**
 * A generated kid — the crowd, and the Customize screen's shuffle. Free values only, so
 * nobody in the room is seen wearing a shop item they never bought. The face fields are
 * drawn last so the looks the crowd had before faces existed stay the same.
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
