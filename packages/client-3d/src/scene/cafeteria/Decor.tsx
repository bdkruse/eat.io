import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type Group } from "three";
import { randomAppearance } from "../../appearance/appearance.js";
import { createRandom } from "../../lib/seededRandom.js";
import { Kid } from "../characters/Kid.js";
import { sharedGeometry, toon, unlit } from "../materials.js";
import { ROOM, SERVING_LINE } from "./layout.js";
import { drawingTexture, signTexture } from "./textures.js";

/** Everything on and along the walls that makes the room a particular school's lunchroom. */
export function Decor() {
  return (
    <group>
      <WallClock position={[1.6, 3.55, ROOM.minZ + 0.04]} />
      <Posters />
      <BulletinBoard />
      <ArtWall />
      <Bunting />
      <VendingMachine position={[ROOM.minX + 0.45, 0, -12.8]} />
      <MilkCooler position={[SERVING_LINE.fromX - 1.05, 0, SERVING_LINE.counterZ + 0.1]} />
      <WaterFountain position={[ROOM.minX + 0.2, 0, -0.6]} />
      <BinStation position={[ROOM.maxX - 0.55, 0, 3.4]} />
      <Janitor position={[8.2, 0, -10.9]} />
    </group>
  );
}

function WallClock({ position }: { position: [number, number, number] }) {
  const hourHand = useRef<Group>(null);
  const minuteHand = useRef<Group>(null);
  const secondHand = useRef<Group>(null);
  useFrame(() => {
    // The real time, so the clock is right whenever someone glances at it.
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    if (secondHand.current) secondHand.current.rotation.z = -(seconds / 60) * Math.PI * 2;
    if (minuteHand.current) minuteHand.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (hourHand.current) hourHand.current.rotation.z = -(hours / 12) * Math.PI * 2;
  });
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={toon("#2f3338")}>
        <cylinderGeometry args={[0.36, 0.36, 0.06, 32]} />
      </mesh>
      <mesh position={[0, 0, 0.032]} material={toon("#fdfbf4")}>
        <circleGeometry args={[0.31, 32]} />
      </mesh>
      {Array.from({ length: 12 }, (_, tick) => {
        const angle = (tick / 12) * Math.PI * 2;
        return (
          <mesh key={tick} position={[Math.sin(angle) * 0.26, Math.cos(angle) * 0.26, 0.035]} rotation={[0, 0, -angle]} material={toon("#2f3338")}>
            <planeGeometry args={[0.02, tick % 3 === 0 ? 0.07 : 0.04]} />
          </mesh>
        );
      })}
      <group ref={hourHand} position={[0, 0, 0.04]}>
        <mesh position={[0, 0.08, 0]} material={toon("#2f3338")}>
          <planeGeometry args={[0.03, 0.17]} />
        </mesh>
      </group>
      <group ref={minuteHand} position={[0, 0, 0.045]}>
        <mesh position={[0, 0.11, 0]} material={toon("#2f3338")}>
          <planeGeometry args={[0.02, 0.23]} />
        </mesh>
      </group>
      <group ref={secondHand} position={[0, 0, 0.05]}>
        <mesh position={[0, 0.1, 0]} material={toon("#d94f3d")}>
          <planeGeometry args={[0.008, 0.25]} />
        </mesh>
      </group>
    </group>
  );
}

interface PosterSpec {
  key: string;
  lines: string[];
  background: string;
  color: string;
  position: [number, number, number];
  rotation: number;
  size: [number, number];
}

const POSTERS: PosterSpec[] = [
  { key: "veggies", lines: ["EAT THE", "RAINBOW!", "fruits & veggies every day"], background: "#5f9e4a", color: "#fffbe8", position: [ROOM.minX + 0.03, 2.2, -5.2], rotation: Math.PI / 2, size: [1.0, 1.35] },
  { key: "water", lines: ["DRINK", "WATER", "your brain loves it"], background: "#4a7fa5", color: "#f2fbff", position: [ROOM.minX + 0.03, 2.2, 0.9], rotation: Math.PI / 2, size: [0.9, 1.2] },
  { key: "kind", lines: ["BE KIND", "save a seat for someone"], background: "#e8a33d", color: "#2f2a24", position: [ROOM.maxX - 0.03, 3.8, -9], rotation: -Math.PI / 2, size: [1.5, 0.75] },
  { key: "otters", lines: ["GO OTTERS!"], background: "#d94f3d", color: "#fff6ea", position: [ROOM.maxX - 0.03, 3.8, 3], rotation: -Math.PI / 2, size: [2.2, 0.62] },
  { key: "clean", lines: ["CLEAN UP", "YOUR SPOT", "trays go back, trash goes in"], background: "#fbf3dc", color: "#8c2f22", position: [ROOM.maxX - 0.03, 2.1, 7.4], rotation: -Math.PI / 2, size: [1.0, 1.3] },
];

function Posters() {
  return (
    <group>
      {POSTERS.map((poster) => {
        const aspect = poster.size[0] / poster.size[1];
        const texture = signTexture(poster.key, {
          lines: poster.lines,
          background: poster.background,
          color: poster.color,
          width: aspect >= 1 ? 768 : 512,
          height: aspect >= 1 ? Math.round(768 / aspect) : Math.round(512 / aspect),
          fontSize: aspect >= 1 ? 150 : 110,
          radius: 10,
        });
        return (
          <mesh key={poster.key} position={poster.position} rotation={[0, poster.rotation, 0]}>
            <planeGeometry args={poster.size} />
            <meshToonMaterial map={texture} />
          </mesh>
        );
      })}
    </group>
  );
}

function BulletinBoard() {
  const notes = useMemo(() => {
    const random = createRandom(31);
    return Array.from({ length: 11 }, () => ({
      x: random.range(-0.95, 0.95),
      y: random.range(-0.45, 0.45),
      width: random.range(0.22, 0.38),
      height: random.range(0.25, 0.36),
      tilt: random.range(-0.12, 0.12),
      color: random.pick(["#fffdf6", "#fff3a8", "#cfe8f7", "#f9d3dc", "#d9f0c9"]),
      pin: random.pick(["#d94f3d", "#4a7fa5", "#e8a33d", "#5f9e4a"]),
    }));
  }, []);
  const header = signTexture("news", { lines: ["LUNCHROOM NEWS"], background: "#fbfaf6", color: "#2f4f45", width: 512, height: 96, radius: 6 });
  return (
    <group position={[ROOM.minX + 0.04, 2.1, -2.6]} rotation={[0, Math.PI / 2, 0]}>
      <mesh material={toon("#8a6a4a")}>
        <boxGeometry args={[2.5, 1.45, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.022]} material={toon("#c79a64")}>
        <planeGeometry args={[2.35, 1.3]} />
      </mesh>
      <mesh position={[0, 0.82, 0.03]}>
        <planeGeometry args={[1.4, 0.26]} />
        <meshToonMaterial map={header} />
      </mesh>
      {notes.map((note, index) => (
        <group key={index} position={[note.x, note.y, 0.025 + index * 0.001]} rotation={[0, 0, note.tilt]}>
          <mesh material={toon(note.color)}>
            <planeGeometry args={[note.width, note.height]} />
          </mesh>
          {[0.1, 0.02, -0.06].map((lineY) => (
            <mesh key={lineY} position={[0, lineY * (note.height / 0.3), 0.001]} material={toon("#b7b2a6")}>
              <planeGeometry args={[note.width * 0.7, 0.012]} />
            </mesh>
          ))}
          <mesh position={[0, note.height / 2 - 0.03, 0.01]} material={toon(note.pin)}>
            <sphereGeometry args={[0.018, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Crayon drawings taped up in a row, the way a hallway fills up in spring. */
function ArtWall() {
  return (
    <group position={[ROOM.minX + 0.03, 2.05, -8.6]} rotation={[0, Math.PI / 2, 0]}>
      {Array.from({ length: 10 }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return (
          <group key={index} position={[-1.6 + column * 0.8, 0.45 - row * 0.85, 0]} rotation={[0, 0, ((index * 7) % 5) * 0.03 - 0.06]}>
            <mesh>
              <planeGeometry args={[0.52, 0.66]} />
              <meshToonMaterial map={drawingTexture(index + 3)} />
            </mesh>
            <mesh position={[0, 0.31, 0.002]} material={unlit("#f3e9b8", 0.9)}>
              <planeGeometry args={[0.16, 0.06]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Strings of pennants swagged across the room. */
function Bunting() {
  // Kept clear of the game table so the top-down shot never looks through a pennant.
  const strings = [-12, -7.5, -3];
  const colors = ["#d94f3d", "#e8a33d", "#e8c04d", "#5f9e4a", "#4a7fa5", "#7d5ba6"];
  const flagGeometry = sharedGeometry("pennant", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.28, 0], 3));
    geometry.computeVertexNormals();
    return geometry;
  });
  return (
    <group>
      {strings.map((z) => {
        const flagCount = 36;
        return (
          <group key={z}>
            {Array.from({ length: flagCount }, (_, index) => {
              const fraction = index / (flagCount - 1);
              const x = ROOM.minX + 0.3 + fraction * (ROOM.maxX - ROOM.minX - 0.6);
              // A shallow catenary: lowest in the middle of the room.
              const sag = 0.7 * (1 - Math.pow(2 * fraction - 1, 2));
              return (
                <mesh
                  key={index}
                  geometry={flagGeometry}
                  material={toon(colors[index % colors.length]!, { doubleSided: true })}
                  position={[x, ROOM.height - 0.25 - sag, z]}
                  rotation={[0, 0, (fraction - 0.5) * -0.15]}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function VendingMachine({ position }: { position: [number, number, number] }) {
  const slots = useMemo(() => {
    const random = createRandom(9);
    return Array.from({ length: 20 }, () => random.pick(["#d94f3d", "#e8a33d", "#5f9e4a", "#4a7fa5", "#e07a9a", "#e8c04d"]));
  }, []);
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[1.0, 1.9, 0.8]} radius={0.04} smoothness={2} position={[0, 0.95, 0]} material={toon("#3e9c95")} castShadow />
      <mesh position={[-0.12, 1.1, 0.405]} material={unlit("#e9f6f4")}>
        <planeGeometry args={[0.6, 1.3]} />
      </mesh>
      {slots.map((color, index) => (
        <mesh key={index} position={[-0.36 + (index % 4) * 0.16, 1.62 - Math.floor(index / 4) * 0.24, 0.41]} material={toon(color)}>
          <boxGeometry args={[0.1, 0.14, 0.02]} />
        </mesh>
      ))}
      <mesh position={[0.34, 1.2, 0.41]} material={toon("#2f3338")}>
        <boxGeometry args={[0.16, 0.5, 0.02]} />
      </mesh>
      <mesh position={[-0.12, 0.25, 0.41]} material={toon("#2f3338")}>
        <boxGeometry args={[0.6, 0.18, 0.02]} />
      </mesh>
    </group>
  );
}

function MilkCooler({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.9, 1.0, 0.7]} radius={0.04} smoothness={2} position={[0, 0.5, 0]} material={toon("#e7e9ea")} castShadow />
      <mesh position={[0, 0.98, 0]} material={unlit("#cfe9f2", 0.7)}>
        <boxGeometry args={[0.8, 0.02, 0.6]} />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => (
        <group key={index} position={[-0.3 + (index % 4) * 0.2, 1.03, -0.18 + Math.floor(index / 4) * 0.18]}>
          <mesh material={toon("#fbfaf6")}>
            <boxGeometry args={[0.07, 0.1, 0.07]} />
          </mesh>
          <mesh position={[0, 0.07, 0]} rotation={[0, Math.PI / 4, 0]} material={toon(index % 3 === 0 ? "#8a5a3c" : "#4a7fa5")}>
            <cylinderGeometry args={[0, 0.05, 0.05, 4]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.55, 0.36]} material={toon("#4a7fa5")}>
        <planeGeometry args={[0.6, 0.2]} />
      </mesh>
    </group>
  );
}

function WaterFountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[0.5, 0.18, 0.4]} radius={0.04} smoothness={2} position={[0, 0.85, 0.2]} material={toon("#c3c9cd")} castShadow />
      <mesh position={[0, 0.45, 0.08]} material={toon("#aab1b6")}>
        <boxGeometry args={[0.2, 0.8, 0.12]} />
      </mesh>
      <mesh position={[0, 0.95, 0.25]} material={toon("#8e979d")}>
        <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
      </mesh>
    </group>
  );
}

function BinStation({ position }: { position: [number, number, number] }) {
  const bins: [string, string][] = [
    ["#5c6366", "TRASH"],
    ["#4a7fa5", "RECYCLE"],
    ["#5f9e4a", "COMPOST"],
  ];
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      {bins.map(([color, label], index) => {
        const texture = signTexture(`bin:${label}`, { lines: [label], background: "#fbfaf6", color, width: 256, height: 80, radius: 8 });
        return (
          <group key={label} position={[(index - 1) * 0.62, 0, 0]}>
            <mesh position={[0, 0.45, 0]} material={toon(color)} castShadow>
              <cylinderGeometry args={[0.25, 0.22, 0.9, 20]} />
            </mesh>
            <mesh position={[0, 0.92, 0]} material={toon(color)}>
              <cylinderGeometry args={[0.27, 0.27, 0.05, 20]} />
            </mesh>
            <mesh position={[0, 0.6, 0.252]}>
              <planeGeometry args={[0.36, 0.11]} />
              <meshToonMaterial map={texture} />
            </mesh>
          </group>
        );
      })}
      {/* the tray return shelf beside the bins */}
      <mesh position={[1.35, 0.8, 0]} material={toon("#c3c9cd")} castShadow>
        <boxGeometry args={[0.7, 0.04, 0.5]} />
      </mesh>
      {[0, 1, 2, 3].map((tray) => (
        <mesh key={tray} position={[1.35, 0.83 + tray * 0.025, 0]} material={toon("#e9dfc9")}>
          <boxGeometry args={[0.4, 0.02, 0.3]} />
        </mesh>
      ))}
    </group>
  );
}

/** The custodian mopping near the stage, behind a wet floor sign. */
function Janitor({ position }: { position: [number, number, number] }) {
  const mop = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (mop.current) mop.current.rotation.z = Math.sin(clock.elapsedTime * 1.6) * 0.35;
  });
  const signFace = signTexture("wetfloor", { lines: ["CAUTION", "wet floor"], background: "#f2c230", color: "#2f2a24", width: 256, height: 256, radius: 12 });
  return (
    <group position={position}>
      <Kid
        appearance={{ ...randomAppearance(808), shirtColor: "#5f9e4a", pantsColor: "#444a52", hairStyle: "short", accessory: "cap" }}
        pose="stand"
        animation="carry"
        scale={1.3}
        rotation={-0.6}
        phase={0.3}
        blobShadow
        detail="low"
      />
      <group ref={mop} position={[-0.25, 0, 0.45]}>
        <mesh position={[0, 0.7, 0]} rotation={[0.25, 0, 0]} material={toon("#8a6a4a")}>
          <cylinderGeometry args={[0.018, 0.018, 1.4, 6]} />
        </mesh>
        <mesh position={[0, 0.05, 0.17]} material={toon("#e9e4d6")}>
          <cylinderGeometry args={[0.15, 0.18, 0.1, 12]} />
        </mesh>
      </group>
      <group position={[0.9, 0, 0.9]} rotation={[0, -0.9, 0]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, 0.33, side * 0.1]} rotation={[side * 0.28, 0, 0]}>
            <boxGeometry args={[0.32, 0.68, 0.015]} />
            <meshToonMaterial map={signFace} />
          </mesh>
        ))}
      </group>
      <mesh position={[0.6, 0.003, 0.2]} rotation={[-Math.PI / 2, 0, 0]} material={unlit("#bfe3ef", 0.35)}>
        <circleGeometry args={[0.8, 24]} />
      </mesh>
    </group>
  );
}
