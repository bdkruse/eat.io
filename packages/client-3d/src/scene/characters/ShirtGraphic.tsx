import { CapsuleGeometry, CircleGeometry, RingGeometry, Shape, ShapeGeometry, Vector2 } from "three";
import type { Graphic } from "../../appearance/appearance.js";
import { sharedGeometry, toon } from "../materials.js";
import { INK, WHITE } from "./KidFace.js";

/**
 * The print on a graphic T, drawn flat in the XY plane facing +Z and about 0.13 across,
 * so it reads at the Customize camera. Each design is a handful of flat shapes stacked a
 * hair apart; the main shape of the single-color designs gets a dark outline so it still
 * shows on a shirt of the same color.
 */

const YELLOW = "#ffd23f";
const GOLD = "#e8c04d";
const ORANGE = "#e2703a";
const RED = "#d94f3d";
const GREEN = "#5f9e4a";
const BLUE = "#4a7fa5";
const CRUST = "#c9843e";
const SHELL = "#e8b34a";
const MEAT = "#8a5a3a";

/** How far each layer sits in front of the one below it. */
const LAYER = 0.0015;

type Point = [number, number];

const polygon = (key: string, points: readonly Point[]) =>
  sharedGeometry(`graphicShape:${key}`, () => new ShapeGeometry(new Shape(points.map(([x, y]) => new Vector2(x, y)))));
const disc = (radius: number, segments: number, thetaStart = 0, thetaLength = Math.PI * 2) =>
  sharedGeometry(
    `graphicDisc:${radius}:${segments}:${thetaStart}:${thetaLength}`,
    () => new CircleGeometry(radius, segments, thetaStart, thetaLength),
  );
const band = (innerRadius: number, outerRadius: number, segments: number, thetaStart = 0, thetaLength = Math.PI * 2) =>
  sharedGeometry(
    `graphicBand:${innerRadius}:${outerRadius}:${segments}:${thetaStart}:${thetaLength}`,
    () => new RingGeometry(innerRadius, outerRadius, segments, 1, thetaStart, thetaLength),
  );
const bar = (radius: number, length: number) =>
  sharedGeometry(`graphicBar:${radius}:${length}`, () => new CapsuleGeometry(radius, length, 3, 8));

const STAR_POINTS: Point[] = Array.from({ length: 10 }, (_, index) => {
  const angle = Math.PI / 2 + (index * Math.PI) / 5;
  const radius = index % 2 === 0 ? 0.062 : 0.027;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
});

const BOLT_POINTS: Point[] = [
  [-0.008, 0.066],
  [0.036, 0.066],
  [0.01, 0.014],
  [0.036, 0.014],
  [-0.022, -0.066],
  [-0.004, -0.008],
  [-0.032, -0.008],
];

const PIZZA_POINTS: Point[] = [
  [-0.056, 0.042],
  [0.056, 0.042],
  [0, -0.064],
];

const DUCK_TAIL_POINTS: Point[] = [
  [-0.045, -0.002],
  [-0.068, 0.022],
  [-0.05, -0.03],
];
const DUCK_BEAK_POINTS: Point[] = [
  [0.04, 0.036],
  [0.068, 0.028],
  [0.04, 0.018],
];

// A long-necked dinosaur side on, facing right.
const DINOSAUR_POINTS: Point[] = [
  [-0.074, -0.034],
  [-0.042, -0.004],
  [-0.012, 0.016],
  [0.018, 0.012],
  [0.032, 0.046],
  [0.044, 0.064],
  [0.068, 0.058],
  [0.068, 0.043],
  [0.049, 0.04],
  [0.046, 0.004],
  [0.04, -0.022],
  [0.038, -0.058],
  [0.022, -0.058],
  [0.02, -0.032],
  [-0.018, -0.032],
  [-0.02, -0.058],
  [-0.036, -0.058],
  [-0.038, -0.034],
];

function scaledAbout(points: readonly Point[], scale: number): Point[] {
  const centerX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const centerY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  return points.map(([x, y]) => [centerX + (x - centerX) * scale, centerY + (y - centerY) * scale]);
}
const STAR_OUTLINE_POINTS = scaledAbout(STAR_POINTS, 1.2);
const BOLT_OUTLINE_POINTS = scaledAbout(BOLT_POINTS, 1.22);
const DINOSAUR_OUTLINE_POINTS = scaledAbout(DINOSAUR_POINTS, 1.1);

export function ShirtGraphic({ graphic, detail }: { graphic: Graphic; detail: "high" | "low" }) {
  const segments = detail === "high" ? 20 : 8;
  const at = (layer: number, x = 0, y = 0): [number, number, number] => [x, y, layer * LAYER];

  switch (graphic) {
    case "star":
      return (
        <group>
          <mesh geometry={polygon("starOutline", STAR_OUTLINE_POINTS)} material={toon(INK)} position={at(0)} />
          <mesh geometry={polygon("star", STAR_POINTS)} material={toon(YELLOW)} position={at(1)} />
        </group>
      );

    case "pizza":
      return (
        <group>
          <mesh geometry={polygon("pizza", PIZZA_POINTS)} material={toon(GOLD)} position={at(0)} />
          <mesh geometry={bar(0.013, 0.1)} material={toon(CRUST)} position={at(1, 0, 0.046)} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.2]} />
          {(
            [
              [-0.02, 0.02],
              [0.021, 0.016],
              [0, -0.02],
            ] as const
          ).map(([x, y]) => (
            <mesh key={`${x}:${y}`} geometry={disc(0.012, segments)} material={toon(RED)} position={at(2, x, y)} />
          ))}
        </group>
      );

    case "lightning":
      return (
        <group>
          <mesh geometry={polygon("boltOutline", BOLT_OUTLINE_POINTS)} material={toon(INK)} position={at(0)} />
          <mesh geometry={polygon("bolt", BOLT_POINTS)} material={toon(YELLOW)} position={at(1)} />
        </group>
      );

    case "planet":
      return (
        <group rotation={[0, 0, -0.35]}>
          {/* The ring's far half behind the planet, its near half in front. */}
          <mesh geometry={band(0.05, 0.064, segments * 2)} material={toon(YELLOW)} position={at(0)} scale={[1, 0.34, 1]} />
          <mesh geometry={disc(0.038, segments * 2)} material={toon(ORANGE)} position={at(1)} />
          <mesh geometry={band(0.02, 0.028, segments, Math.PI * 0.15, Math.PI * 0.5)} material={toon(GOLD)} position={at(2)} />
          <mesh
            geometry={band(0.05, 0.064, segments, Math.PI, Math.PI)}
            material={toon(YELLOW)}
            position={at(3)}
            scale={[1, 0.34, 1]}
          />
        </group>
      );

    case "rubberDuck":
      return (
        <group>
          <mesh geometry={polygon("duckTail", DUCK_TAIL_POINTS)} material={toon(YELLOW)} position={at(0)} />
          <mesh geometry={disc(0.04, segments * 2)} material={toon(YELLOW)} position={at(1, -0.006, -0.018)} scale={[1.3, 0.85, 1]} />
          <mesh geometry={disc(0.025, segments * 2)} material={toon(YELLOW)} position={at(2, 0.024, 0.03)} />
          <mesh geometry={polygon("duckBeak", DUCK_BEAK_POINTS)} material={toon(ORANGE)} position={at(3)} />
          <mesh geometry={disc(0.02, segments)} material={toon(GOLD)} position={at(3, -0.012, -0.016)} scale={[1.4, 0.8, 1]} />
          <mesh geometry={disc(0.006, segments)} material={toon(INK)} position={at(3, 0.03, 0.036)} />
        </group>
      );

    case "dinosaur":
      return (
        <group>
          <mesh geometry={polygon("dinosaurOutline", DINOSAUR_OUTLINE_POINTS)} material={toon(INK)} position={at(0)} />
          <mesh geometry={polygon("dinosaur", DINOSAUR_POINTS)} material={toon(GREEN)} position={at(1)} />
          {(
            [
              [-0.02, -0.012],
              [0.008, -0.004],
              [0.022, -0.022],
            ] as const
          ).map(([x, y]) => (
            <mesh key={`${x}:${y}`} geometry={disc(0.007, segments)} material={toon(GOLD)} position={at(2, x, y)} />
          ))}
          <mesh geometry={disc(0.005, segments)} material={toon(INK)} position={at(2, 0.054, 0.053)} />
        </group>
      );

    case "taco":
      return (
        <group position={[0, 0.012, 0]}>
          {/* The filling pokes up above the shell's open top. */}
          {(
            [
              [-0.038, GREEN, 0.014],
              [-0.018, RED, 0.011],
              [0, GREEN, 0.015],
              [0.02, MEAT, 0.012],
              [0.04, GREEN, 0.013],
            ] as const
          ).map(([x, color, radius]) => (
            <mesh key={x} geometry={disc(radius, segments)} material={toon(color)} position={at(0, x, 0.002)} />
          ))}
          <mesh geometry={disc(0.058, segments * 2, Math.PI, Math.PI)} material={toon(CRUST)} position={at(1)} />
          <mesh geometry={disc(0.05, segments * 2, Math.PI, Math.PI)} material={toon(SHELL)} position={at(2, 0, 0.002)} />
        </group>
      );

    case "rainbow":
      return (
        <group position={[0, -0.028, 0]}>
          {([RED, ORANGE, YELLOW, GREEN, BLUE] as const).map((color, index) => (
            <mesh
              key={color}
              geometry={band(0.064 - (index + 1) * 0.0105, 0.064 - index * 0.0105, segments * 2, 0, Math.PI)}
              material={toon(color)}
              position={at(0)}
            />
          ))}
          {([-1, 1] as const).map((side) => (
            <group key={side} position={[side * 0.042, 0, 0]}>
              <mesh geometry={disc(0.014, segments)} material={toon(WHITE)} position={at(1, -0.01, -0.002)} />
              <mesh geometry={disc(0.017, segments)} material={toon(WHITE)} position={at(1, 0.006, 0.004)} />
              <mesh geometry={disc(0.012, segments)} material={toon(WHITE)} position={at(1, 0.02, -0.004)} />
            </group>
          ))}
        </group>
      );
  }
}
