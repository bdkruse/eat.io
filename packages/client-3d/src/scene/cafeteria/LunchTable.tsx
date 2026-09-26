import { RoundedBox } from "@react-three/drei";
import { CylinderGeometry } from "three";
import { BENCH_HEIGHT } from "../characters/Kid.js";
import { sharedGeometry, toon } from "../materials.js";

const legGeometry = () => sharedGeometry("tableLeg", () => new CylinderGeometry(0.028, 0.028, 1, 10));

export const LUNCH_TABLE_TOP = "#efe6d0";
const TABLE_EDGE = "#b99b6b";
const STEEL = "#aab1b6";

export interface LunchTableProps {
  length: number;
  width: number;
  height: number;
  position?: [number, number, number];
  rotation?: number;
  /** Bench color for the +Z and -Z sides. */
  nearBench?: string;
  farBench?: string;
  topColor?: string;
  /** Bench standing-off distance from the table's center line. */
  benchOffset?: number;
  castShadow?: boolean;
}

/**
 * The classic fold-out cafeteria table with a bench on each long side. Used for every
 * table in the room, the game table included, so the game table belongs to the room.
 */
export function LunchTable({
  length,
  width,
  height,
  position = [0, 0, 0],
  rotation = 0,
  nearBench = "#8fb3a0",
  farBench = "#8fb3a0",
  benchOffset = 0.8,
  topColor = LUNCH_TABLE_TOP,
  castShadow = true,
}: LunchTableProps) {
  const topThickness = 0.06;
  const benchLength = length * 0.92;
  const legInset = { x: length / 2 - 0.25, z: width / 2 - 0.15 };

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* top, with a darker edge band like laminate over particle board */}
      <RoundedBox
        args={[length, topThickness, width]}
        radius={0.025}
        smoothness={3}
        position={[0, height - topThickness / 2, 0]}
        material={toon(topColor)}
        castShadow={castShadow}
        receiveShadow
      />
      <mesh position={[0, height - topThickness - 0.012, 0]} material={toon(TABLE_EDGE)}>
        <boxGeometry args={[length - 0.02, 0.025, width - 0.02]} />
      </mesh>

      {[-1, 1].map((sideX) =>
        [-1, 1].map((sideZ) => (
          <mesh
            key={`${sideX}${sideZ}`}
            geometry={legGeometry()}
            material={toon(STEEL)}
            position={[sideX * legInset.x, (height - topThickness) / 2, sideZ * legInset.z]}
            scale={[1, height - topThickness, 1]}
          />
        )),
      )}

      {/* benches, joined to the table frame by a low rail like the fold-out kind */}
      {([
        [1, nearBench],
        [-1, farBench],
      ] as const).map(([sideZ, color]) => (
        <group key={sideZ} position={[0, 0, sideZ * benchOffset]}>
          <RoundedBox
            args={[benchLength, 0.05, 0.3]}
            radius={0.02}
            smoothness={2}
            position={[0, BENCH_HEIGHT - 0.025, 0]}
            material={toon(color)}
            castShadow={castShadow}
            receiveShadow
          />
          {[-1, 1].map((sideX) => (
            <mesh
              key={sideX}
              geometry={legGeometry()}
              material={toon(STEEL)}
              position={[sideX * (benchLength / 2 - 0.2), (BENCH_HEIGHT - 0.05) / 2, 0]}
              scale={[0.8, BENCH_HEIGHT - 0.05, 0.8]}
            />
          ))}
        </group>
      ))}
      <mesh material={toon(STEEL)} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, benchOffset * 2, 8]} />
      </mesh>
    </group>
  );
}
