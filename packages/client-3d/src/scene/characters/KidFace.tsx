import { CapsuleGeometry, ConeGeometry, ExtrudeGeometry, Shape, SphereGeometry, TorusGeometry, type Material } from "three";
import type { Appearance, EyeShape, MouthShape } from "../../appearance/appearance.js";
import { sharedGeometry, toon, unlit } from "../materials.js";

export const INK = "#2a2522";
export const WHITE = "#ffffff";
export const MOUTH = "#7a2f27";
const TEETH = "#fbfaf6";
const TONGUE = "#e07a9a";
const TONGUE_GROOVE = "#c9543f";

/** The one eye color that glows rather than takes the light. */
const GLOWING_GOLD: Appearance["eyeColor"] = "#ffcc33";

const sphere = (radius: number, detail = 12) =>
  sharedGeometry(`sphere:${radius}:${detail}`, () => new SphereGeometry(radius, detail, Math.max(8, detail * 0.75)));

/** Upper half of a sphere. */
const dome = (radius: number) =>
  sharedGeometry(`dome:${radius}`, () => new SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));

/** Lower half of a sphere, the bowl of a grin. */
const bowl = (radius: number) =>
  sharedGeometry(`bowl:${radius}`, () => new SphereGeometry(radius, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));

/** An arc of `arc` radians, centered on the bottom of its circle. */
const arcGeometry = (radius: number, tube: number, arc: number) =>
  sharedGeometry(`mouthArc:${radius}:${tube}:${arc}`, () => {
    const geometry = new TorusGeometry(radius, tube, 6, 18, arc);
    geometry.rotateZ(-Math.PI / 2 - arc / 2);
    geometry.translate(0, radius, 0);
    return geometry;
  });

const lineGeometry = (radius: number, length: number) =>
  sharedGeometry(`faceLine:${radius}:${length}`, () => new CapsuleGeometry(radius, length, 4, 8));

const fangGeometry = () => sharedGeometry("fang", () => new ConeGeometry(0.0085, 0.026, 8).rotateX(Math.PI));

function starShape(outerRadius: number, innerRadius: number): Shape {
  const shape = new Shape();
  for (let pointIndex = 0; pointIndex < 10; pointIndex++) {
    const radius = pointIndex % 2 === 0 ? outerRadius : innerRadius;
    const angle = Math.PI / 2 + (pointIndex * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (pointIndex === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/** A heart about `size` across, point down, centered on the origin. */
function heartShape(size: number): Shape {
  const unit = size / 2;
  const shape = new Shape();
  shape.moveTo(0, 0.45 * unit);
  shape.bezierCurveTo(0.1 * unit, 0.95 * unit, 1.0 * unit, 0.95 * unit, 1.0 * unit, 0.35 * unit);
  shape.bezierCurveTo(1.0 * unit, -0.1 * unit, 0.4 * unit, -0.45 * unit, 0, -0.85 * unit);
  shape.bezierCurveTo(-0.4 * unit, -0.45 * unit, -1.0 * unit, -0.1 * unit, -1.0 * unit, 0.35 * unit);
  shape.bezierCurveTo(-1.0 * unit, 0.95 * unit, -0.1 * unit, 0.95 * unit, 0, 0.45 * unit);
  return shape;
}

/** A flat, softly bevelled badge of a shape, its back face at z = 0. */
const flatShape = (key: string, build: () => Shape) =>
  sharedGeometry(`flatShape:${key}`, () => {
    const geometry = new ExtrudeGeometry(build(), {
      depth: 0.003,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 2,
      curveSegments: 10,
    });
    geometry.translate(0, 0, 0.0015);
    return geometry;
  });

function irisMaterial(eyeColor: Appearance["eyeColor"]): Material {
  return eyeColor === GLOWING_GOLD ? unlit(eyeColor) : toon(eyeColor);
}

export interface EyeProps {
  shape: EyeShape;
  eyeColor: Appearance["eyeColor"];
  skinTone: string;
  /** -1 the kid's right eye, 1 their left. */
  side: -1 | 1;
  detail: "high" | "low";
}

/**
 * One eye: its color, a dark pupil, and a highlight. Everything sits in the parent's
 * eyes group, whose y scale is the blink — so every shape closes the same way.
 */
export function Eye({ shape, eyeColor, skinTone, side, detail }: EyeProps) {
  const iris = irisMaterial(eyeColor);
  const pupil = toon(INK);
  const shine = toon(WHITE);
  const highDetail = detail === "high";

  switch (shape) {
    case "round":
      return (
        <>
          <mesh geometry={sphere(0.03)} material={iris} scale={[0.9, 1.2, 0.6]} />
          <mesh geometry={sphere(0.017, 10)} material={pupil} position={[0, 0, 0.012]} scale={[0.9, 1.15, 0.5]} />
          {highDetail && <mesh geometry={sphere(0.009, 8)} material={shine} position={[0.008, 0.012, 0.02]} />}
        </>
      );

    case "almond":
      // Wider and lower, the outer corner lifted.
      return (
        <group rotation={[0, 0, side * 0.2]}>
          <mesh geometry={sphere(0.03)} material={iris} scale={[1.2, 0.8, 0.6]} />
          <mesh geometry={sphere(0.016, 10)} material={pupil} position={[0, 0, 0.012]} scale={[1, 1, 0.5]} />
          {highDetail && <mesh geometry={sphere(0.008, 8)} material={shine} position={[0.01, 0.008, 0.02]} />}
        </group>
      );

    case "sleepy":
      // A heavy upper lid in skin tone covers the top half.
      return (
        <>
          <mesh geometry={sphere(0.03)} material={iris} scale={[0.95, 1.15, 0.6]} />
          <mesh geometry={sphere(0.017, 10)} material={pupil} position={[0, -0.004, 0.012]} scale={[0.9, 1.1, 0.5]} />
          {highDetail && <mesh geometry={sphere(0.0075, 8)} material={shine} position={[0.008, -0.009, 0.02]} />}
          <mesh
            geometry={dome(0.031)}
            material={toon(skinTone, { doubleSided: true })}
            position={[0, 0.001, 0.001]}
            scale={[1.02, 1.2, 0.78]}
          />
          {highDetail && (
            <mesh
              geometry={lineGeometry(0.0042, 0.05)}
              material={pupil}
              position={[0, 0.001, 0.021]}
              rotation={[0, 0, Math.PI / 2 - side * 0.08]}
              scale={[1, 1, 0.6]}
            />
          )}
        </>
      );

    case "sparkly":
      // Big and bright, with a second glint.
      return (
        <>
          <mesh geometry={sphere(0.03)} material={iris} scale={[1, 1.3, 0.62]} />
          <mesh geometry={sphere(0.018, 10)} material={pupil} position={[0, -0.002, 0.012]} scale={[0.9, 1.15, 0.5]} />
          <mesh geometry={sphere(0.0105, 8)} material={shine} position={[0.009, 0.014, 0.02]} />
          {highDetail && (
            <>
              <mesh geometry={sphere(0.0055, 8)} material={shine} position={[-0.009, -0.013, 0.021]} />
              <mesh geometry={sphere(0.0035, 6)} material={shine} position={[0.013, -0.004, 0.02]} />
            </>
          )}
        </>
      );

    case "star":
    case "heart": {
      const outline = shape === "star" ? flatShape("starOutline", () => starShape(0.041, 0.021)) : flatShape("heartOutline", () => heartShape(0.07));
      const fill = shape === "star" ? flatShape("starFill", () => starShape(0.034, 0.016)) : flatShape("heartFill", () => heartShape(0.058));
      // Laid flat on the face, turned to follow the curve of the head.
      return (
        <group position={[0, 0, 0.007]} rotation={[-0.13, side * 0.36, 0]}>
          <mesh geometry={outline} material={pupil} />
          <mesh geometry={fill} material={iris} position={[0, 0, 0.003]} />
          <mesh geometry={sphere(0.011, 10)} material={pupil} position={[0, shape === "heart" ? 0.002 : 0, 0.008]} scale={[1, 1, 0.35]} />
          {highDetail && <mesh geometry={sphere(0.006, 8)} material={shine} position={[0.009, 0.011, 0.01]} scale={[1, 1, 0.5]} />}
        </group>
      );
    }
  }
}

/**
 * The mouth at rest. Talking and chomping swap it for the open mouth, which is the same
 * for every shape.
 */
export function RestingMouth({ shape, detail }: { shape: MouthShape; detail: "high" | "low" }) {
  const mouth = toon(MOUTH);
  const highDetail = detail === "high";
  const smile = <mesh geometry={arcGeometry(0.032, 0.0075, Math.PI)} material={mouth} position={[0, -0.032, 0]} />;

  switch (shape) {
    case "smile":
      return smile;

    case "grin":
      // Wide open D with a row of top teeth.
      return (
        <group position={[0, 0.004, 0.002]}>
          <mesh geometry={bowl(0.036)} material={toon(MOUTH, { doubleSided: true })} scale={[1.2, 0.95, 0.42]} />
          <mesh
            geometry={lineGeometry(0.0065, 0.056)}
            material={toon(TEETH)}
            position={[0, -0.0055, 0.0135]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[1, 1, 0.6]}
          />
          {highDetail && <mesh geometry={sphere(0.014, 10)} material={toon(TONGUE)} position={[0, -0.024, 0.006]} scale={[1.3, 0.6, 0.4]} />}
        </group>
      );

    case "calm":
      // A small, nearly straight line.
      return <mesh geometry={arcGeometry(0.11, 0.0068, 0.4)} material={mouth} position={[0, -0.022, 0]} />;

    case "smirk":
      // One corner up.
      return (
        <group position={[0.004, -0.026, 0]} rotation={[0, 0, 0.38]}>
          <mesh geometry={arcGeometry(0.036, 0.0075, Math.PI * 0.6)} material={mouth} />
        </group>
      );

    case "tongue":
      // A smile with the tongue poking out, a little to one side.
      return (
        <>
          {smile}
          <group position={[0.006, -0.036, 0.006]} rotation={[0.35, 0, 0.18]}>
            <mesh geometry={sphere(0.018, 12)} material={toon(TONGUE)} scale={[1, 1.15, 0.5]} />
            {highDetail && (
              <mesh geometry={lineGeometry(0.0022, 0.012)} material={toon(TONGUE_GROOVE)} position={[0, -0.002, 0.008]} />
            )}
          </group>
        </>
      );

    case "fangs":
      // A smile with two pointed fangs hanging over the lip.
      return (
        <>
          {smile}
          {[-1, 1].map((side) => (
            <mesh key={side} geometry={fangGeometry()} material={toon(TEETH)} position={[side * 0.017, -0.038, 0.007]} />
          ))}
        </>
      );
  }
}
