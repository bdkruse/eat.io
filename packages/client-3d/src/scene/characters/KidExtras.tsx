import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Group,
} from "three";
import type { Accessory } from "../../appearance/appearance.js";
import { sharedGeometry, toon, unlit } from "../materials.js";
import { INK, WHITE } from "./KidFace.js";

/**
 * The shop's extras, drawn from primitives in the same cel-shaded style as the rest of
 * the kid. The five silly ones (propeller cap, traffic cone, viking helmet, alien
 * antennae, banana hat) are big and bold on purpose, so they read from the game camera
 * straight overhead as well as up close.
 */

/** Extras that sit on top of the head: hair tufts, puffs, and top curls tuck under. */
export const HAT_ACCESSORIES: ReadonlySet<Accessory> = new Set<Accessory>([
  "cap",
  "beanie",
  "headphones",
  "chefHat",
  "crown",
  "propellerCap",
  "trafficCone",
  "vikingHelmet",
  "bananaHat",
]);

const DARK = "#2f3338";
const CLOTH_WHITE = "#fbfaf6";
const GOLD = "#e8c04d";
const CONE_ORANGE = "#e2703a";
const CONE_BASE = "#d4622d";
const METAL = "#aab1b6";
const METAL_DARK = "#8e979d";
const LEATHER = "#8a6a4a";
const HORN = "#e9d8a6";
const ALIEN_GREEN = "#6fae5a";
const ALIEN_GLOW = "#b6ff3b";
const PEEL = "#ecc94b";
const BANANA = "#fff4c9";
const PEEL_TIP = "#8a6a4a";
const PROPELLER_CAP_COLORS = ["#d94f3d", GOLD, "#4a7fa5", "#5f9e4a"] as const;

const sphere = (radius: number, detail = 12) =>
  sharedGeometry(`sphere:${radius}:${detail}`, () => new SphereGeometry(radius, detail, Math.max(8, detail * 0.75)));
/** Upper part of a sphere, `coverage` in units of PI measured down from the top. */
const cap = (radius: number, coverage: number) =>
  sharedGeometry(`cap:${radius}:${coverage}`, () => new SphereGeometry(radius, 24, 14, 0, Math.PI * 2, 0, Math.PI * coverage));
/** A wedge of a sphere from the top down, centered on the front — a strip of banana peel. */
const peelStrip = (radius: number, width: number, coverage: number) =>
  sharedGeometry(`peelStrip:${radius}:${width}:${coverage}`, () =>
    new SphereGeometry(radius, 6, 12, Math.PI / 2 - width / 2, width, 0, Math.PI * coverage),
  );
/** One quarter of a cap, for the propeller cap's colored panels. */
const capPanel = (radius: number, coverage: number, quarter: number) =>
  sharedGeometry(`capPanel:${radius}:${coverage}:${quarter}`, () =>
    new SphereGeometry(radius, 8, 14, (quarter * Math.PI) / 2, Math.PI / 2, 0, Math.PI * coverage),
  );
const cylinder = (radiusTop: number, radiusBottom: number, height: number, openEnded = false, segments = 24) =>
  sharedGeometry(
    `cylinder:${radiusTop}:${radiusBottom}:${height}:${openEnded}:${segments}`,
    () => new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded),
  );
const torus = (radius: number, tube: number, arc = Math.PI * 2) =>
  sharedGeometry(`torus:${radius}:${tube}:${arc}`, () => new TorusGeometry(radius, tube, 8, 32, arc));
const capsule = (radius: number, length: number) =>
  sharedGeometry(`capsule:${radius}:${length}`, () => new CapsuleGeometry(radius, length, 6, 12));
const cone = (radius: number, height: number) => sharedGeometry(`cone:${radius}:${height}`, () => new ConeGeometry(radius, height, 12));
const box = (width: number, height: number, depth: number) =>
  sharedGeometry(`box:${width}:${height}:${depth}`, () => new BoxGeometry(width, height, depth));

/** A tube along `points` that narrows from `baseRadius` to `tipRadius` — horns and stalks. */
const taperedTube = (key: string, points: [number, number, number][], baseRadius: number, tipRadius: number) =>
  sharedGeometry(`taperedTube:${key}`, () => {
    const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
    const tubularSegments = 16;
    const radialSegments = 10;
    const geometry = new TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
    const positions = geometry.attributes["position"]!;
    const center = new Vector3();
    const vertex = new Vector3();
    for (let ringIndex = 0; ringIndex <= tubularSegments; ringIndex++) {
      const along = ringIndex / tubularSegments;
      curve.getPointAt(along, center);
      const radius = baseRadius + (tipRadius - baseRadius) * along;
      for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex++) {
        const vertexIndex = ringIndex * (radialSegments + 1) + radialIndex;
        vertex.fromBufferAttribute(positions, vertexIndex).sub(center).multiplyScalar(radius).add(center);
        positions.setXYZ(vertexIndex, vertex.x, vertex.y, vertex.z);
      }
    }
    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
    return geometry;
  });

const HORN_POINTS: [number, number, number][] = [
  [-0.03, -0.005, 0],
  [0, 0, 0],
  [0.065, 0.005, 0.005],
  [0.115, 0.05, 0.01],
  [0.135, 0.13, 0],
  [0.12, 0.2, -0.015],
];
const ANTENNA_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [0.01, 0.06, 0.005],
  [0.035, 0.12, 0.01],
  [0.05, 0.17, 0],
];

export interface HeadExtraProps {
  accessory: Accessory;
  /** The accessory color the kid's free extras use — a match for the shirt. */
  color: string;
  detail: "high" | "low";
}

/** The new head extras. Anything else draws nothing here. */
export function HeadExtra({ accessory, color, detail }: HeadExtraProps) {
  const highDetail = detail === "high";
  switch (accessory) {
    case "sunglasses":
      return <Sunglasses highDetail={highDetail} />;
    case "headphones":
      return <Headphones color={color} />;
    case "chefHat":
      return <ChefHat />;
    case "crown":
      return <Crown highDetail={highDetail} />;
    case "propellerCap":
      return <PropellerCap />;
    case "trafficCone":
      return <TrafficCone />;
    case "vikingHelmet":
      return <VikingHelmet highDetail={highDetail} />;
    case "alienAntennae":
      return <AlienAntennae />;
    case "bananaHat":
      return <BananaHat />;
    default:
      return null;
  }
}

function Sunglasses({ highDetail }: { highDetail: boolean }) {
  const frame = toon(INK);
  const lens = toon(DARK);
  return (
    <group position={[0, 0.022, 0.17]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.063, 0, 0]} rotation={[0, side * 0.3, 0]}>
          <mesh geometry={sphere(0.042, 16)} material={frame} scale={[1.18, 0.86, 0.24]} />
          <mesh geometry={sphere(0.036, 16)} material={lens} position={[0, -0.001, 0.004]} scale={[1.2, 0.84, 0.24]} />
          {highDetail && (
            <mesh
              geometry={capsule(0.004, 0.018)}
              material={toon(WHITE)}
              position={[side * 0.012, 0.01, 0.012]}
              rotation={[0, 0, -0.8]}
              scale={[1, 1, 0.4]}
            />
          )}
          {/* the arm back to the ear */}
          <mesh
            geometry={box(0.008, 0.01, 0.13)}
            material={frame}
            position={[side * 0.052, 0.006, -0.06]}
            rotation={[0, side * -0.28, 0]}
          />
        </group>
      ))}
      <mesh geometry={capsule(0.006, 0.02)} material={frame} position={[0, 0.006, 0.012]} rotation={[0, 0, Math.PI / 2]} />
    </group>
  );
}

function Headphones({ color }: { color: string }) {
  const band = toon(DARK);
  const cup = toon(color);
  return (
    <group rotation={[-0.12, 0, 0]} position={[0, 0.005, -0.005]}>
      <mesh geometry={torus(0.205, 0.016, Math.PI)} material={band} castShadow />
      <mesh geometry={torus(0.195, 0.012, Math.PI * 0.7)} material={cup} rotation={[0, 0, Math.PI * 0.15]} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.19, -0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh geometry={cylinder(0.058, 0.058, 0.045)} material={cup} castShadow />
          <mesh geometry={cylinder(0.046, 0.05, 0.02)} material={toon(DARK)} position={[0, side * 0.028, 0]} />
        </group>
      ))}
    </group>
  );
}

function ChefHat() {
  const cloth = toon(CLOTH_WHITE);
  return (
    <group rotation={[-0.14, 0, 0.05]}>
      <mesh geometry={cylinder(0.188, 0.19, 0.1)} material={cloth} position={[0, 0.12, 0]} castShadow />
      {/* the puff: a big middle and a ring of billows */}
      <mesh geometry={sphere(0.15, 18)} material={cloth} position={[0, 0.3, 0]} scale={[1, 0.85, 1]} castShadow />
      {[0, 1, 2, 3, 4, 5].map((billowIndex) => {
        const angle = (billowIndex / 6) * Math.PI * 2;
        return (
          <mesh
            key={billowIndex}
            geometry={sphere(0.1, 14)}
            material={cloth}
            position={[Math.cos(angle) * 0.13, 0.26, Math.sin(angle) * 0.13]}
          />
        );
      })}
    </group>
  );
}

function Crown({ highDetail }: { highDetail: boolean }) {
  const gold = toon(GOLD, { doubleSided: true });
  const gemColors = ["#d94f3d", "#4a7fa5", "#5f9e4a", "#4a7fa5", "#d94f3d"];
  return (
    <group position={[0, 0.14, 0.005]} rotation={[-0.1, 0, 0.12]}>
      <mesh geometry={cylinder(0.158, 0.148, 0.065, true)} material={gold} castShadow />
      <mesh geometry={torus(0.15, 0.01)} material={gold} position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {gemColors.map((gemColor, pointIndex) => {
        // Five points; the middle one faces front.
        const angle = Math.PI / 2 + ((pointIndex - 2) * Math.PI * 2) / 5;
        const x = Math.cos(angle) * 0.155;
        const z = Math.sin(angle) * 0.155;
        return (
          <group key={pointIndex} position={[x, 0, z]} rotation={[0, -angle + Math.PI / 2, 0]}>
            <mesh geometry={cone(0.042, 0.09)} material={gold} position={[0, 0.076, 0]} scale={[1, 1, 0.45]} />
            <mesh geometry={sphere(0.015, 10)} material={gold} position={[0, 0.124, 0]} />
            {(highDetail || pointIndex === 2) && (
              <mesh geometry={sphere(0.016, 10)} material={toon(gemColor)} position={[0, 0.002, 0.008]} scale={[1, 1, 0.6]} />
            )}
          </group>
        );
      })}
    </group>
  );
}

function PropellerCap() {
  const propeller = useRef<Group>(null);
  useFrame((_, delta) => {
    if (propeller.current) propeller.current.rotation.y += delta * 9;
  });
  return (
    <group rotation={[-0.12, 0, 0]}>
      {PROPELLER_CAP_COLORS.map((panelColor, quarter) => (
        <mesh
          key={quarter}
          geometry={capPanel(0.194, 0.5, quarter)}
          material={toon(panelColor, { doubleSided: true })}
          position={[0, 0.012, 0]}
          castShadow
        />
      ))}
      {/* a short brim */}
      <mesh
        geometry={cylinder(0.1, 0.1, 0.012, false, 20)}
        material={toon(PROPELLER_CAP_COLORS[2])}
        position={[0, 0.03, 0.15]}
        rotation={[0.1, 0, 0]}
        scale={[1.1, 1, 0.8]}
      />
      <mesh geometry={cylinder(0.008, 0.01, 0.07, false, 8)} material={toon(METAL)} position={[0, 0.235, 0]} />
      <group ref={propeller} position={[0, 0.27, 0]}>
        <mesh geometry={sphere(0.02, 10)} material={toon(GOLD)} />
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            geometry={sphere(0.07, 12)}
            material={toon(side === 1 ? PROPELLER_CAP_COLORS[0] : PROPELLER_CAP_COLORS[2])}
            position={[side * 0.085, 0, 0]}
            rotation={[side * 0.35, 0, 0]}
            scale={[1.15, 0.12, 0.38]}
            castShadow
          />
        ))}
      </group>
    </group>
  );
}

function TrafficCone() {
  const orange = toon(CONE_ORANGE);
  const stripe = toon(CLOTH_WHITE);
  const bottomRadius = 0.15;
  const topRadius = 0.022;
  const height = 0.4;
  // The cone's radius at a height above its base, so the stripes hug it.
  const radiusAt = (heightAboveBase: number) => bottomRadius + ((topRadius - bottomRadius) * heightAboveBase) / height;
  const stripeHeights = [0.12, 0.25];
  return (
    <group position={[0, 0.135, -0.01]} rotation={[-0.12, 0, 0.14]}>
      <mesh geometry={box(0.36, 0.028, 0.36)} material={toon(CONE_BASE)} castShadow />
      <mesh geometry={cylinder(topRadius, bottomRadius, height)} material={orange} position={[0, height / 2 + 0.014, 0]} castShadow />
      {stripeHeights.map((stripeHeight) => (
        <mesh
          key={stripeHeight}
          geometry={cylinder(radiusAt(stripeHeight + 0.03) + 0.003, radiusAt(stripeHeight - 0.03) + 0.003, 0.06, true)}
          material={stripe}
          position={[0, stripeHeight + 0.014, 0]}
        />
      ))}
    </group>
  );
}

function VikingHelmet({ highDetail }: { highDetail: boolean }) {
  const metal = toon(METAL, { doubleSided: true });
  const leather = toon(LEATHER);
  const horn = toon(HORN);
  return (
    <group rotation={[-0.12, 0, 0]}>
      <mesh geometry={cap(0.2, 0.47)} material={metal} position={[0, 0.02, 0]} castShadow />
      {/* a ridge over the top, front to back */}
      <mesh
        geometry={torus(0.201, 0.012, Math.PI * 0.8)}
        material={toon(METAL_DARK)}
        position={[0, 0.02, 0]}
        rotation={[0, Math.PI / 2, Math.PI * 0.1]}
      />
      <mesh geometry={torus(0.19, 0.024)} material={leather} position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {highDetail &&
        [0, 1, 2, 3, 4, 5, 6, 7].map((rivetIndex) => {
          const angle = (rivetIndex / 8) * Math.PI * 2 + Math.PI / 8;
          return (
            <mesh
              key={rivetIndex}
              geometry={sphere(0.011, 8)}
              material={toon(GOLD)}
              position={[Math.cos(angle) * 0.212, 0.045, Math.sin(angle) * 0.212]}
            />
          );
        })}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.165, 0.11, 0]} scale={[side, 1, 1]}>
          <mesh geometry={taperedTube("horn", HORN_POINTS, 0.048, 0.005)} material={horn} castShadow />
          {/* a metal collar where the horn meets the helmet */}
          <mesh
            geometry={cylinder(0.054, 0.054, 0.03, false, 16)}
            material={toon(METAL_DARK)}
            position={[0.016, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
          />
        </group>
      ))}
    </group>
  );
}

function AlienAntennae() {
  const antennae = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    antennae.current.forEach((antenna, index) => {
      if (!antenna) return;
      const side = index === 0 ? -1 : 1;
      antenna.rotation.z = -side * 0.3 + Math.sin(time * 5.5 + index * 1.7) * 0.12;
      antenna.rotation.x = Math.sin(time * 4.1 + index) * 0.1;
    });
  });
  const green = toon(ALIEN_GREEN);
  return (
    <group rotation={[-0.1, 0, 0]}>
      <mesh geometry={torus(0.19, 0.01, Math.PI)} material={green} />
      {[-1, 1].map((side, index) => (
        <group
          key={side}
          ref={(node) => void (antennae.current[index] = node)}
          position={[side * 0.07, 0.175, 0]}
          rotation={[0, 0, -side * 0.3]}
        >
          <group scale={[side, 1, 1]}>
            <mesh geometry={taperedTube("antenna", ANTENNA_POINTS, 0.011, 0.007)} material={green} />
          </group>
          <mesh geometry={sphere(0.036, 14)} material={unlit(ALIEN_GLOW)} position={[side * 0.05, 0.19, 0]} />
          <mesh geometry={sphere(0.017, 10)} material={green} />
        </group>
      ))}
    </group>
  );
}

/** The banana hat's peel strips: where each hangs (turned from the front) and how far down it reaches. */
const PEEL_STRIPS = [
  { turn: Math.PI / 3, coverage: 0.36 },
  { turn: -Math.PI / 3, coverage: 0.36 },
  { turn: (Math.PI * 5) / 6, coverage: 0.45 },
  { turn: -(Math.PI * 5) / 6, coverage: 0.45 },
] as const;
const PEEL_RADIUS = 0.197;

function BananaHat() {
  const peel = toon(PEEL, { doubleSided: true });
  const tip = toon(PEEL_TIP);
  return (
    <group rotation={[-0.1, 0, 0.06]}>
      {/* strips of peel draped over the head, meeting at the top */}
      {PEEL_STRIPS.map(({ turn, coverage }) => {
        const endAngle = Math.PI * coverage;
        // The end of the strip curls out: turned from straight down the head toward level.
        const curl = Math.PI / 2 + endAngle - 0.95;
        return (
          <group key={turn} rotation={[0, turn, 0]} position={[0, 0.012, 0]}>
            <mesh geometry={peelStrip(PEEL_RADIUS, 1.25, coverage)} material={peel} castShadow />
            <group position={[0, Math.cos(endAngle) * PEEL_RADIUS, Math.sin(endAngle) * PEEL_RADIUS]} rotation={[curl, 0, 0]}>
              <mesh geometry={sphere(0.06, 12)} material={peel} position={[0, 0.035, 0]} scale={[1.25, 0.75, 0.22]} />
              <mesh geometry={sphere(0.02, 8)} material={tip} position={[0, 0.078, 0]} scale={[1.5, 0.6, 0.5]} />
            </group>
          </group>
        );
      })}
      {/* the fruit standing up out of the peel, a little bent */}
      <group position={[0, 0.19, 0]} rotation={[0, 0, -0.2]}>
        <mesh geometry={capsule(0.064, 0.12)} material={toon(BANANA)} position={[0, 0.07, 0]} castShadow />
        <mesh geometry={sphere(0.022, 8)} material={tip} position={[0, 0.196, 0]} scale={[1, 0.6, 1]} />
      </group>
      <mesh geometry={sphere(0.05, 10)} material={peel} position={[0, 0.2, 0]} scale={[1.3, 0.5, 1.3]} />
    </group>
  );
}

/** Worn at the collar, so it sits on the torso rather than turning with the head. */
export function BowTie({ shirtColor }: { shirtColor: string }) {
  // Red, unless the shirt is already red or pink — then a classic black.
  const tieColor = shirtColor === "#d94f3d" || shirtColor === "#e07a9a" ? DARK : "#d94f3d";
  const tie = toon(tieColor);
  return (
    <group position={[0, 0.405, 0.095]} rotation={[-0.55, 0, 0]}>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={cone(0.04, 0.07)}
          material={tie}
          position={[side * 0.034, 0, 0]}
          rotation={[0, 0, side * (Math.PI / 2)]}
          scale={[1, 1, 0.5]}
        />
      ))}
      <mesh geometry={sphere(0.018, 10)} material={tie} scale={[1, 1, 0.8]} />
    </group>
  );
}
