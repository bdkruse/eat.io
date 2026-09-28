import type { VisibleClothing } from "../../appearance/appearance.js";

/** Which of the look's colors a part of the kid is drawn in. */
export type Covering = "shirt" | "pants" | "skin";

export interface LegCovering {
  pelvis: Covering;
  thigh: Covering;
  shin: Covering;
  /** A pants-colored sleeve around the top of each thigh: a short pant leg, or the part of
   *  a skirt that lies over the lap of a seated kid. */
  thighCuff: "shorts" | "skirtLap" | null;
}

/**
 * How the visible clothing covers the hips and legs. A skirt and a dress hang from the
 * waist as their own shape; seated, the thighs point forward out of that shape, so the
 * part that would lie over the lap is drawn on the thighs instead.
 */
export function legCovering(clothing: VisibleClothing, seated: boolean): LegCovering {
  if (clothing.onePiece === "dress" || clothing.onePiece === "sparklyDress") {
    return { pelvis: "shirt", thigh: seated ? "shirt" : "skin", shin: "skin", thighCuff: null };
  }
  switch (clothing.bottom) {
    case "shorts":
      return { pelvis: "pants", thigh: "skin", shin: "skin", thighCuff: "shorts" };
    case "skirt":
      return { pelvis: "pants", thigh: "skin", shin: "skin", thighCuff: seated ? "skirtLap" : null };
    // Pants, and overalls (which leave no bottom showing), cover the whole leg.
    default:
      return { pelvis: "pants", thigh: "pants", shin: "pants", thighCuff: null };
  }
}
