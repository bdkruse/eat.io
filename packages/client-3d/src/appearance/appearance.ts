import { createRandom, hashString } from "../lib/seededRandom.js";

export const SKIN_TONES = ["#f6d7bf", "#eec19b", "#d9a47a", "#b87a4f", "#8d5634", "#5e3a24"] as const;

export const HAIR_STYLES = ["short", "bob", "curly", "ponytail", "buzz", "puffs"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const HAIR_COLORS = ["#2b2220", "#3d2a1e", "#5a3825", "#8a3b1f", "#c4622d", "#d9b25f"] as const;

export const SHIRT_COLORS = [
  "#d94f3d", // tomato — the "you" accent
  "#4a7fa5", // blue — the "opponent" accent
  "#5f9e4a",
  "#e8a33d",
  "#7d5ba6",
  "#3e9c95",
  "#e07a9a",
  "#f4f1ea",
] as const;

export const PANTS_COLORS = ["#3f5a7a", "#b59a6d", "#444a52", "#6b7048"] as const;

export const ACCESSORIES = ["none", "glasses", "cap", "headband", "beanie"] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export interface Appearance {
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory: Accessory;
}

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
 * The opponent's look is not on the wire (customization is local only), so it is derived
 * from their name — the same opponent always looks the same.
 */
export function appearanceFromName(name: string): Appearance {
  return randomAppearance(hashString(`opponent:${name}`));
}
