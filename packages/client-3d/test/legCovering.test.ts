import { expect, test } from "vitest";
import { DEFAULT_APPEARANCE, visibleClothing, type Appearance } from "../src/appearance/appearance.js";
import { legCovering } from "../src/scene/characters/legCovering.js";

const coveringFor = (change: Partial<Appearance>, seated = false) =>
  legCovering(visibleClothing({ ...DEFAULT_APPEARANCE, ...change }), seated);

test("pants cover the whole leg", () => {
  expect(coveringFor({ bottom: "pants" })).toEqual({ pelvis: "pants", thigh: "pants", shin: "pants", thighCuff: null });
});

test("shorts show skin below a short pant leg", () => {
  expect(coveringFor({ bottom: "shorts" })).toEqual({ pelvis: "pants", thigh: "skin", shin: "skin", thighCuff: "shorts" });
});

test("a skirt shows the legs, and covers the lap only when seated", () => {
  expect(coveringFor({ bottom: "skirt" })).toEqual({ pelvis: "pants", thigh: "skin", shin: "skin", thighCuff: null });
  expect(coveringFor({ bottom: "skirt" }, true)).toEqual({ pelvis: "pants", thigh: "skin", shin: "skin", thighCuff: "skirtLap" });
});

test("a dress, plain or sparkly, is the shirt color over the hips and, seated, the lap", () => {
  for (const onePiece of ["dress", "sparklyDress"] as const) {
    expect(coveringFor({ onePiece, bottom: "pants" })).toEqual({ pelvis: "shirt", thigh: "skin", shin: "skin", thighCuff: null });
    expect(coveringFor({ onePiece, bottom: "pants" }, true)).toEqual({ pelvis: "shirt", thigh: "shirt", shin: "skin", thighCuff: null });
  }
});

test("overalls cover the whole leg in the pants color, whatever bottom is stored", () => {
  expect(coveringFor({ onePiece: "overalls", bottom: "skirt" })).toEqual({ pelvis: "pants", thigh: "pants", shin: "pants", thighCuff: null });
});
