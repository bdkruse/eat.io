import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from "three";
import type { Appearance, VisibleClothing } from "../../appearance/appearance.js";
import { mixColor, sharedGeometry, toon, unlit } from "../materials.js";
import { INK, WHITE } from "./KidFace.js";
import type { LegCovering } from "./legCovering.js";
import { ShirtGraphic } from "./ShirtGraphic.js";

/**
 * The clothing drawn on top of the kid's body: the details of each top, the overalls'
 * bib and straps, and the skirt and dress that hang from the waist. The plain parts — the
 * torso and sleeves in the shirt color, the legs in whatever `legCovering` says — are the
 * kid's own meshes, so a tee and pants add nothing here.
 *
 * Torso-local numbers below follow the torso capsule in Kid.tsx: radius 0.15, its
 * straight part from y 0.09 to 0.29, squashed to 0.82 front to back, so the chest's
 * front is at z ≈ 0.123.
 */

type Detail = "high" | "low";

const TORSO_RADIUS = 0.15;
const TORSO_DEPTH_SCALE = 0.82;
const CHEST_FRONT = TORSO_RADIUS * TORSO_DEPTH_SCALE;
const BUTTON_GOLD = "#e8c04d";
const EAR_PINK = "#e07a9a";
const SPARKLE_COLORS = [WHITE, "#ffe066", "#ffd1e8"] as const;

const radialSegments = (detail: Detail) => (detail === "high" ? 24 : 12);

const sphere = (radius: number, segments = 12) =>
  sharedGeometry(`sphere:${radius}:${segments}`, () => new SphereGeometry(radius, segments, Math.max(3, Math.round(segments * 0.75))));
const box = (width: number, height: number, depth: number) =>
  sharedGeometry(`box:${width}:${height}:${depth}`, () => new BoxGeometry(width, height, depth));
const capsule = (radius: number, length: number) =>
  sharedGeometry(`capsule:${radius}:${length}`, () => new CapsuleGeometry(radius, length, 6, 12));
const cone = (radius: number, height: number) => sharedGeometry(`cone:${radius}:${height}`, () => new ConeGeometry(radius, height, 12));
const frustum = (radiusTop: number, radiusBottom: number, height: number, segments: number, openEnded: boolean) =>
  sharedGeometry(
    `frustum:${radiusTop}:${radiusBottom}:${height}:${segments}:${openEnded}`,
    () => new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded),
  );
/** Part of an open cylinder centered on the front (+Z), `width` radians around. */
const frontPanel = (radius: number, height: number, width: number, segments: number) =>
  sharedGeometry(
    `frontPanel:${radius}:${height}:${width}:${segments}`,
    () => new CylinderGeometry(radius, radius, height, segments, 1, true, -width / 2, width),
  );
const arc = (radius: number, tube: number, arcLength: number, segments: number) =>
  sharedGeometry(`arc:${radius}:${tube}:${arcLength}:${segments}`, () => new TorusGeometry(radius, tube, 6, segments, arcLength));

/** How a skirt-like shape hangs from the waist, in body-local units (the pelvis is at 0.5). */
interface Drape {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  centerY: number;
}

const SKIRT: Drape = { radiusTop: 0.152, radiusBottom: 0.235, height: 0.15, centerY: 0.5 };
/** Chest to knee: the bodice is the torso itself, and this is the part below the waist. */
const DRESS_STANDING: Drape = { radiusTop: 0.15, radiusBottom: 0.26, height: 0.3, centerY: 0.42 };
/** Seated, the lap is drawn on the thighs, so only the hips are wrapped. */
const DRESS_SEATED: Drape = { radiusTop: 0.15, radiusBottom: 0.2, height: 0.14, centerY: 0.5 };
const DRAPE_DEPTH_SCALE = 0.9;

/** Fixed points on a drape's surface for the sparkly dress, so every sparkly dress matches. */
function sparklePoints(drape: Drape, count: number): [number, number, number][] {
  return Array.from({ length: count }, (_, index) => {
    const fraction = (index + 0.5) / count;
    const angle = index * 2.399963;
    const radius = (drape.radiusTop + (drape.radiusBottom - drape.radiusTop) * fraction) * 1.015;
    return [Math.sin(angle) * radius, drape.height / 2 - fraction * drape.height, Math.cos(angle) * radius];
  });
}
const SPARKLES_STANDING = sparklePoints(DRESS_STANDING, 42);
const SPARKLES_SEATED = sparklePoints(DRESS_SEATED, 22);
/** A few on the front of the bodice, torso-local. */
const BODICE_SPARKLES: [number, number, number][] = (
  [
    [-0.07, 0.25],
    [0.05, 0.28],
    [-0.02, 0.18],
    [0.08, 0.14],
    [-0.09, 0.11],
    [0.02, 0.1],
    [0.1, 0.23],
    [-0.05, 0.31],
  ] as const
).map(([x, y]) => [x, y, Math.sqrt(TORSO_RADIUS ** 2 - x ** 2) * TORSO_DEPTH_SCALE + 0.004]);

function Sparkles({ points }: { points: readonly [number, number, number][] }) {
  return (
    <>
      {points.map((point, index) => (
        <mesh key={index} geometry={sphere(0.007, 4)} material={unlit(SPARKLE_COLORS[index % SPARKLE_COLORS.length]!)} position={point} />
      ))}
    </>
  );
}

export interface ClothingProps {
  appearance: Appearance;
  clothing: VisibleClothing;
  detail: Detail;
  castShadow: boolean;
}

/** Inside the torso group: what each top adds, the overalls' bib, and the dress's bodice sparkle. */
export function TorsoClothing({ appearance, clothing, detail, castShadow }: ClothingProps) {
  const hoodie = clothing.top === "hoodie" || clothing.top === "catEarHoodie";
  return (
    <>
      {clothing.top === "buttonUp" && <ButtonUpDetails shirtColor={appearance.shirtColor} />}
      {hoodie && (
        <HoodieDetails shirtColor={appearance.shirtColor} catEars={clothing.top === "catEarHoodie"} detail={detail} castShadow={castShadow} />
      )}
      {clothing.graphic && (
        <group position={[0, 0.265, CHEST_FRONT + 0.002]}>
          <ShirtGraphic graphic={clothing.graphic} detail={detail} />
        </group>
      )}
      {clothing.onePiece === "overalls" && <OverallsBib pantsColor={appearance.pantsColor} detail={detail} />}
      {clothing.onePiece === "sparklyDress" && detail === "high" && <Sparkles points={BODICE_SPARKLES} />}
    </>
  );
}

function ButtonUpDetails({ shirtColor }: { shirtColor: string }) {
  const trim = toon(mixColor(shirtColor, WHITE, 0.4));
  const button = toon(mixColor(shirtColor, INK, 0.45));
  return (
    <>
      {/* Collar points, lying on the top of the chest either side of the neck. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          geometry={box(0.055, 0.038, 0.012)}
          material={trim}
          position={[side * 0.034, 0.388, 0.078]}
          rotation={[-0.75, 0, side * 0.55]}
        />
      ))}
      <mesh geometry={box(0.012, 0.22, 0.006)} material={trim} position={[0, 0.2, CHEST_FRONT + 0.001]} />
      {[0.33, 0.26, 0.19, 0.12].map((y) => (
        <mesh key={y} geometry={sphere(0.009, 8)} material={button} position={[0, y, CHEST_FRONT + 0.004]} scale={[1, 1, 0.5]} />
      ))}
    </>
  );
}

function HoodieDetails({
  shirtColor,
  catEars,
  detail,
  castShadow,
}: {
  shirtColor: string;
  catEars: boolean;
  detail: Detail;
  castShadow: boolean;
}) {
  const shirt = toon(shirtColor);
  const seam = toon(mixColor(shirtColor, INK, 0.28));
  return (
    <>
      {/* The hood, down, bunched behind the neck, with its rim around the neck. */}
      <mesh geometry={sphere(0.12, detail === "high" ? 16 : 10)} material={shirt} position={[0, 0.43, -0.1]} scale={[1.3, 0.72, 0.62]} castShadow={castShadow} />
      <mesh geometry={arc(0.07, 0.021, Math.PI * 2, detail === "high" ? 20 : 10)} material={shirt} position={[0, 0.412, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {catEars &&
        ([-1, 1] as const).map((side) => (
          // High on the sides of the hood, so the tips peek out past the head from the front.
          <group key={side} position={[side * 0.15, 0.49, -0.1]} rotation={[-0.15, 0, -side * 0.8]}>
            <mesh geometry={cone(0.046, 0.09)} material={shirt} position={[0, 0.036, 0]} scale={[1, 1, 0.55]} />
            <mesh geometry={cone(0.027, 0.055)} material={toon(EAR_PINK)} position={[0, 0.03, 0.017]} scale={[1, 1, 0.3]} />
          </group>
        ))}
      {/* The front pocket. */}
      <mesh geometry={box(0.15, 0.065, 0.014)} material={seam} position={[0, 0.085, CHEST_FRONT - 0.005]} />
      {detail === "high" &&
        ([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.028, 0, 0]}>
            <mesh geometry={capsule(0.005, 0.06)} material={toon(WHITE)} position={[0, 0.35, 0.105]} rotation={[-0.35, 0, 0]} />
            <mesh geometry={sphere(0.009, 8)} material={toon(WHITE)} position={[0, 0.312, 0.117]} />
          </group>
        ))}
    </>
  );
}

/** Low enough that a graphic on the T underneath still shows above it. */
const BIB_TOP = 0.17;
/** The straight front and back runs of each strap, from the bib up to where the shoulder curves. */
const STRAP_LENGTH = 0.29 - BIB_TOP;
const STRAP_CENTER = (0.29 + BIB_TOP) / 2;

function OverallsBib({ pantsColor, detail }: { pantsColor: string; detail: Detail }) {
  const denim = toon(pantsColor, { doubleSided: true });
  const segments = radialSegments(detail);
  const strapRadius = 0.009;
  const strapOffset = TORSO_RADIUS + 0.004;
  return (
    <>
      {/* The waist, wrapped all the way round, and the bib up the front. */}
      <mesh geometry={frustum(0.153, 0.153, 0.13, segments, true)} material={denim} position={[0, 0.02, 0]} scale={[1, 1, 0.9]} />
      <group scale={[1, 1, TORSO_DEPTH_SCALE * 1.01]}>
        <mesh geometry={frontPanel(0.155, BIB_TOP - 0.06, 1.5, Math.round(segments / 2))} material={denim} position={[0, (BIB_TOP + 0.06) / 2, 0]} />
      </group>
      {([-1, 1] as const).map((side) => {
        const x = side * 0.07;
        // The chest's cross-section at this x, so the strap lies on it.
        const sectionRadius = Math.sqrt(strapOffset ** 2 - x ** 2);
        return (
          <group key={side} position={[x, 0, 0]}>
            <group scale={[1, 1, TORSO_DEPTH_SCALE]}>
              <mesh geometry={capsule(strapRadius, STRAP_LENGTH)} material={denim} position={[0, STRAP_CENTER, sectionRadius]} />
              <mesh geometry={capsule(strapRadius, STRAP_LENGTH)} material={denim} position={[0, STRAP_CENTER, -sectionRadius]} />
              {/* Over the shoulder, front to back. */}
              <group position={[0, 0.29, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <mesh geometry={arc(sectionRadius, strapRadius, Math.PI, detail === "high" ? 16 : 8)} material={denim} />
              </group>
            </group>
            <mesh geometry={sphere(0.012, 8)} material={toon(BUTTON_GOLD)} position={[0, BIB_TOP, CHEST_FRONT + 0.009]} scale={[1, 1, 0.6]} />
          </group>
        );
      })}
    </>
  );
}

/** Inside the body group, below the torso: the skirt, and the dress's flare from the waist. */
export function WaistClothing({ appearance, clothing, detail, castShadow, seated }: ClothingProps & { seated: boolean }) {
  const segments = radialSegments(detail);
  const drape = (shape: Drape, color: string) => (
    <mesh
      geometry={frustum(shape.radiusTop, shape.radiusBottom, shape.height, segments, true)}
      material={toon(color, { doubleSided: true })}
      castShadow={castShadow}
    />
  );

  if (clothing.onePiece === "dress" || clothing.onePiece === "sparklyDress") {
    const shape = seated ? DRESS_SEATED : DRESS_STANDING;
    return (
      <group position={[0, shape.centerY, 0]} scale={[1, 1, DRAPE_DEPTH_SCALE]}>
        {drape(shape, appearance.shirtColor)}
        {clothing.onePiece === "sparklyDress" && detail === "high" && <Sparkles points={seated ? SPARKLES_SEATED : SPARKLES_STANDING} />}
      </group>
    );
  }
  if (clothing.bottom === "skirt") {
    return (
      <group position={[0, SKIRT.centerY, 0]} scale={[1, 1, DRAPE_DEPTH_SCALE]}>
        {drape(SKIRT, appearance.pantsColor)}
      </group>
    );
  }
  return null;
}

/** Inside a hip group, around the top of the thigh (which runs down -Y). */
export function ThighCuff({ cuff, pantsColor, detail }: { cuff: LegCovering["thighCuff"]; pantsColor: string; detail: Detail }) {
  if (cuff === null) return null;
  const segments = detail === "high" ? 16 : 8;
  return cuff === "shorts" ? (
    <mesh geometry={frustum(0.071, 0.075, 0.1, segments, false)} material={toon(pantsColor)} position={[0, -0.045, 0]} />
  ) : (
    <mesh geometry={frustum(0.074, 0.08, 0.12, segments, false)} material={toon(pantsColor)} position={[0, -0.06, 0]} />
  );
}
