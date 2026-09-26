import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Side,
  type Texture,
} from "three";

/**
 * Three flat bands of light — the cel-shaded look. Few enough bands to read as cartoon,
 * the lightest band bright enough that colors stay true rather than muddy.
 */
function createGradientMap(): DataTexture {
  const bands = new Uint8Array([110, 190, 255]);
  const texture = new DataTexture(bands, bands.length, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

let gradientMap: DataTexture | null = null;
const toonMaterials = new Map<string, MeshToonMaterial>();
const basicMaterials = new Map<string, MeshBasicMaterial>();

/** Shared per color. Every surface in the scene goes through here so the style holds. */
export function toon(color: string, options: { doubleSided?: boolean } = {}): MeshToonMaterial {
  const key = `${color}:${options.doubleSided ? "double" : "front"}`;
  let material = toonMaterials.get(key);
  if (!material) {
    gradientMap ??= createGradientMap();
    const side: Side = options.doubleSided ? DoubleSide : 0;
    material = new MeshToonMaterial({ color, gradientMap, side });
    toonMaterials.set(key, material);
  }
  return material;
}

const texturedMaterials = new Map<Texture, MeshToonMaterial>();

/** Cel-shaded with a painted texture — floors, walls, posters. */
export function toonTextured(map: Texture, tint = "#ffffff"): MeshToonMaterial {
  let material = texturedMaterials.get(map);
  if (!material) {
    gradientMap ??= createGradientMap();
    material = new MeshToonMaterial({ color: tint, map, gradientMap });
    texturedMaterials.set(map, material);
  }
  return material;
}

/** Unlit — for glowing things (lights, windows, screens) and blob shadows. */
export function unlit(color: string, opacity = 1): MeshBasicMaterial {
  const key = `${color}:${opacity}`;
  let material = basicMaterials.get(key);
  if (!material) {
    material = new MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    basicMaterials.set(key, material);
  }
  return material;
}

const geometries = new Map<string, BufferGeometry>();

/** Geometry built once per key and shared by every mesh that asks for it. */
export function sharedGeometry<Geometry extends BufferGeometry>(key: string, build: () => Geometry): Geometry {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = build();
    geometries.set(key, geometry);
  }
  return geometry as Geometry;
}

/** Mix two hex colors; `amount` 0 keeps `from`, 1 gives `to`. */
export function mixColor(from: string, to: string, amount: number): string {
  return `#${new Color(from).lerp(new Color(to), amount).getHexString()}`;
}
