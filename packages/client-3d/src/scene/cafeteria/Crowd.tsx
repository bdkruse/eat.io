import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, type Group } from "three";
import type { Appearance } from "../../appearance/appearance.js";
import { crowdAppearance } from "../../appearance/crowdAppearance.js";
import { createRandom } from "../../lib/seededRandom.js";
import { Kid } from "../characters/Kid.js";
import type { Animation } from "../characters/poses.js";
import type { DetailBudget } from "../detail.js";
import { WALK_LOOPS, walkerCrowdIndex, WALKERS_PER_LOOP } from "./layout.js";

interface Walker {
  appearance: Appearance;
  loop: readonly (readonly [number, number])[];
  /** Total loop length, precomputed. */
  loopLength: number;
  speed: number;
  start: number;
  /** Walking the loop backwards, so traffic flows both ways. */
  reverse: boolean;
  animation: Animation;
  carrying: boolean;
  phase: number;
  /** Sideways offset from the aisle's center line so pairs do not overlap. */
  lane: number;
  /** Position within its loop's group; low detail keeps only the first few. */
  indexOnLoop: number;
}

function loopLength(loop: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let index = 0; index < loop.length; index++) {
    const [ax, az] = loop[index]!;
    const [bx, bz] = loop[(index + 1) % loop.length]!;
    total += Math.hypot(bx - ax, bz - az);
  }
  return total;
}

/** Position and heading at a distance along a closed loop. */
function pointOnLoop(loop: readonly (readonly [number, number])[], distance: number): { x: number; z: number; heading: number } {
  let remaining = distance;
  for (let index = 0; ; index = (index + 1) % loop.length) {
    const [ax, az] = loop[index]!;
    const [bx, bz] = loop[(index + 1) % loop.length]!;
    const segment = Math.hypot(bx - ax, bz - az);
    if (remaining <= segment) {
      const fraction = remaining / segment;
      return { x: ax + (bx - ax) * fraction, z: az + (bz - az) * fraction, heading: Math.atan2(bx - ax, bz - az) };
    }
    remaining -= segment;
  }
}

export function Crowd({ budget }: { budget: DetailBudget }) {
  const walkers = useMemo<Walker[]>(() => {
    const random = createRandom(77);
    return WALK_LOOPS.flatMap((loop, loopIndex) =>
      Array.from({ length: WALKERS_PER_LOOP }, (_, index) => {
        const length = loopLength(loop);
        const carrying = random.chance(0.4);
        return {
          appearance: crowdAppearance(walkerCrowdIndex(loopIndex, index)),
          loop,
          loopLength: length,
          speed: random.range(0.75, 1.05),
          start: (index / WALKERS_PER_LOOP) * length + random.range(0, 1.5),
          reverse: index % 2 === 1,
          animation: carrying ? "carry" : random.chance(0.5) ? "chat" : "idle",
          carrying,
          phase: random.next(),
          lane: index % 2 === 1 ? -0.35 : 0.35,
          indexOnLoop: index,
        };
      }),
    );
  }, []);

  return (
    <group>
      {walkers.map((walker, index) =>
        walker.indexOnLoop < budget.walkersPerLoop ? <WalkingKid key={index} walker={walker} /> : null,
      )}
    </group>
  );
}

function WalkingKid({ walker }: { walker: Walker }) {
  const group = useRef<Group>(null);
  const heading = useRef<number | null>(null);

  useFrame(({ clock }, delta) => {
    const node = group.current;
    if (!node) return;
    const travelled = walker.start + clock.elapsedTime * walker.speed;
    const distance = walker.reverse
      ? walker.loopLength - (travelled % walker.loopLength)
      : travelled % walker.loopLength;
    const point = pointOnLoop(walker.loop, distance);
    const facing = walker.reverse ? point.heading + Math.PI : point.heading;
    // Keep to the right of the aisle, like kids are told to.
    const laneX = Math.cos(facing) * walker.lane;
    const laneZ = -Math.sin(facing) * walker.lane;
    node.position.set(point.x + laneX, 0, point.z + laneZ);

    // Turn corners smoothly rather than snapping.
    if (heading.current === null) heading.current = facing;
    let difference = facing - heading.current;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    heading.current = MathUtils.damp(heading.current, heading.current + difference, 8, delta);
    node.rotation.y = heading.current;
  });

  return (
    <group ref={group}>
      <Kid
        appearance={walker.appearance}
        pose="walk"
        animation={walker.animation}
        carrying={walker.carrying}
        phase={walker.phase}
        detail="low"
        blobShadow
      />
    </group>
  );
}
