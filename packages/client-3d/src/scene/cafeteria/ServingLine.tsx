import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { SphereGeometry, type Group } from "three";
import { randomAppearance, type Appearance } from "../../appearance/appearance.js";
import { Kid } from "../characters/Kid.js";
import { sharedGeometry, toon, unlit } from "../materials.js";
import { keepsKid, type DetailBudget } from "../detail.js";
import { ROOM, SERVING_LINE } from "./layout.js";
import { signTexture } from "./textures.js";

const STEEL = "#c3c9cd";
const STEEL_DARK = "#8e979d";
const COUNTER_HEIGHT = 0.9;

const PANS: { food: string; lumps: string[] }[] = [
  { food: "#e2a63d", lumps: ["#d9952f", "#eab44d"] }, // nuggets
  { food: "#e8c04d", lumps: ["#f0cf5f"] }, // corn
  { food: "#5f9e4a", lumps: ["#4f8c3c", "#6fae5a"] }, // broccoli
  { food: "#c9543f", lumps: ["#b7472f"] }, // meatballs
  { food: "#e9d8a6", lumps: ["#f2e3b8"] }, // mashed potatoes
  { food: "#e2703a", lumps: ["#d4622d"] }, // carrots
];

const lumpGeometry = () => sharedGeometry("lump", () => new SphereGeometry(0.035, 8, 6));
const steamGeometry = () => sharedGeometry("steam", () => new SphereGeometry(0.06, 8, 6));

const staffLook = (seed: number): Appearance => ({
  ...randomAppearance(seed),
  hairStyle: "buzz",
  hairColor: "#d9b25f", // lightest option on the palette, closest to a hairnet's pale mesh
  shirtColor: "#4a7fa5",
  pantsColor: "#444a52",
  accessory: seed % 2 === 0 ? "glasses" : "none",
  // A uniform: the apron goes over a plain tee and pants.
  top: "tee",
  bottom: "pants",
  onePiece: "none",
});

/** The steam-table counter, the staff behind it, and the kids waiting in line. */
export function ServingLine({ budget }: { budget: DetailBudget }) {
  const length = SERVING_LINE.toX - SERVING_LINE.fromX;
  const centerX = (SERVING_LINE.toX + SERVING_LINE.fromX) / 2;
  const menuBoard = signTexture("menu", {
    lines: ["TODAY'S LUNCH", "chicken nuggets · tots · corn · milk"],
    background: "#2f4f45",
    color: "#fdf7e3",
    width: 1024,
    height: 256,
    border: "#d9c9a4",
  });
  const kitchenSign = signTexture("kitchen", {
    lines: ["MAPLE GROVE", "cafeteria"],
    background: "#e8a33d",
    color: "#2f2a24",
    width: 768,
    height: 256,
  });

  return (
    <group>
      {/* the kitchen wall behind the counter, with a pass-through window */}
      <group position={[centerX, 0, ROOM.minZ + 0.02]}>
        <mesh position={[0, 1.55, 0.01]} material={toon("#e7e2d6")}>
          <planeGeometry args={[length + 0.8, 1.1]} />
        </mesh>
        <mesh position={[0, 1.55, 0.015]} material={unlit("#3b3f3d")}>
          <planeGeometry args={[length - 0.4, 0.9]} />
        </mesh>
        <mesh position={[0, 3.05, 0.03]}>
          <planeGeometry args={[4.4, 1.1]} />
          <meshToonMaterial map={menuBoard} />
        </mesh>
        <mesh position={[length / 2 + 1.3, 3.1, 0.03]}>
          <planeGeometry args={[1.9, 0.63]} />
          <meshToonMaterial map={kitchenSign} />
        </mesh>
      </group>

      {/* counter */}
      <group position={[centerX, 0, SERVING_LINE.counterZ]}>
        <RoundedBox args={[length, COUNTER_HEIGHT, 0.8]} radius={0.03} smoothness={2} position={[0, COUNTER_HEIGHT / 2, 0]} material={toon(STEEL)} castShadow receiveShadow />
        <mesh position={[0, 0.08, 0.41]} material={toon(STEEL_DARK)}>
          <boxGeometry args={[length, 0.16, 0.02]} />
        </mesh>
        {/* tray slide rails on the kids' side */}
        {[0.72, 0.82].map((y) => (
          <mesh key={y} position={[0, y, 0.52]} rotation={[0, 0, Math.PI / 2]} material={toon(STEEL_DARK)}>
            <cylinderGeometry args={[0.02, 0.02, length, 8]} />
          </mesh>
        ))}
        {/* sneeze guard */}
        <mesh position={[0, COUNTER_HEIGHT + 0.42, 0.2]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[length - 0.2, 0.55, 0.015]} />
          <meshBasicMaterial color="#dff3f7" transparent opacity={0.28} depthWrite={false} />
        </mesh>
        {[-length / 2 + 0.2, 0, length / 2 - 0.2].map((x) => (
          <mesh key={x} position={[x, COUNTER_HEIGHT + 0.3, 0.12]} material={toon(STEEL_DARK)}>
            <cylinderGeometry args={[0.015, 0.015, 0.6, 6]} />
          </mesh>
        ))}
        {/* food pans */}
        {PANS.map((pan, index) => {
          const x = -length / 2 + 0.75 + index * ((length - 1.5) / (PANS.length - 1));
          return (
            <group key={index} position={[x, COUNTER_HEIGHT, -0.05]}>
              <mesh position={[0, 0.01, 0]} material={toon(STEEL_DARK)}>
                <boxGeometry args={[0.9, 0.04, 0.5]} />
              </mesh>
              <mesh position={[0, 0.035, 0]} material={toon(pan.food)}>
                <boxGeometry args={[0.8, 0.03, 0.42]} />
              </mesh>
              {Array.from({ length: 9 }, (_, lump) => (
                <mesh
                  key={lump}
                  geometry={lumpGeometry()}
                  material={toon(pan.lumps[lump % pan.lumps.length]!)}
                  position={[-0.3 + (lump % 3) * 0.3 + ((lump * 37) % 10) / 100, 0.055, -0.13 + Math.floor(lump / 3) * 0.13]}
                  scale={[1.2, 0.7, 1]}
                />
              ))}
              {budget.steam && <Steam seed={index} />}
            </group>
          );
        })}
      </group>

      {/* staff */}
      {[-6.8, -3.4].map((x, index) => (
        <Kid key={x} appearance={staffLook(40 + index)} pose="stand" animation="serve" phase={index * 0.43} position={[x, 0, SERVING_LINE.staffZ]} rotation={0} scale={1.28} apron blobShadow />
      ))}

      <LineOfKids keepEvery={budget.lineKeepEvery} />
    </group>
  );
}

/** Wisps rising off a hot pan, each on its own loop. */
function Steam({ seed }: { seed: number }) {
  const puffs = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    puffs.current.forEach((puff, index) => {
      if (!puff) return;
      const cycle = (clock.elapsedTime * 0.35 + index / 3 + seed * 0.17) % 1;
      puff.position.set(Math.sin(cycle * 6 + index) * 0.08 + (index - 1) * 0.2, 0.1 + cycle * 0.7, 0);
      puff.scale.setScalar(0.5 + cycle * 1.4);
      const material = (puff.children[0] as { material?: { opacity: number } } | undefined)?.material;
      if (material) material.opacity = 0.35 * (1 - cycle);
    });
  });
  return (
    <group>
      {[0, 1, 2].map((index) => (
        <group key={index} ref={(node) => void (puffs.current[index] = node)}>
          <mesh geometry={steamGeometry()}>
            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Kids waiting their turn, shuffling forward and chatting with the one behind. */
function LineOfKids({ keepEvery }: { keepEvery: number }) {
  const spots = [-8.4, -7.5, -6.5, -5.6, -4.6, -3.7, -2.6, -1.8];
  const shufflers = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    shufflers.current.forEach((kid, index) => {
      if (!kid) return;
      // Everyone shuffles a half step forward, then settles, like a real line.
      const step = ((clock.elapsedTime * 0.12 + index * 0.05) % 1) * 0.25;
      kid.position.x = spots[index]! - step;
    });
  });
  return (
    <group>
      {spots.map((x, index) =>
        !keepsKid(index, keepEvery) ? null : (
        <group key={x} ref={(node) => void (shufflers.current[index] = node)} position={[x, 0, SERVING_LINE.lineZ]}>
          <Kid
            appearance={randomAppearance(200 + index)}
            pose="stand"
            animation={index % 3 === 1 ? "chat" : index % 3 === 2 ? "listen" : "carry"}
            carrying={index % 3 === 0}
            phase={index * 0.61}
            rotation={-Math.PI / 2 + (index % 2 === 0 ? -0.35 : 0.5)}
            detail="low"
            blobShadow
          />
        </group>
        ),
      )}
    </group>
  );
}
