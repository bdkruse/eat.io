import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import { toon, toonTextured, unlit } from "../materials.js";
import { ROOM, STAGE } from "./layout.js";
import { blockWallTexture, floorTexture, outsideTexture, signTexture } from "./textures.js";

const WAINSCOT = "#6fa596";
const TRIM = "#d9c9a4";
const CEILING = "#f7f3ea";
const WINDOW_FRAME = "#fbfaf6";
const CURTAIN = "#b8433a";
const STAGE_WOOD = "#c8955d";

const width = ROOM.maxX - ROOM.minX;
const depth = ROOM.maxZ - ROOM.minZ;
const centerX = (ROOM.maxX + ROOM.minX) / 2;
const centerZ = (ROOM.maxZ + ROOM.minZ) / 2;
const WAINSCOT_HEIGHT = 1.15;

export const WINDOW_ZS = [-11, -7, -3, 1, 5] as const;

/** Floor, walls, ceiling, windows, doors, and the stage at the back. */
export function Room() {
  const floor = useMemo(() => {
    const texture = floorTexture().clone();
    texture.repeat.set(width / 4, depth / 4);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const walls = useMemo(() => {
    const along = (length: number) => {
      const texture = blockWallTexture().clone();
      texture.repeat.set(length / 1.6, (ROOM.height - WAINSCOT_HEIGHT) / 0.8);
      texture.needsUpdate = true;
      return texture;
    };
    return { long: along(depth), wide: along(width) };
  }, []);

  const upperHeight = ROOM.height - WAINSCOT_HEIGHT;
  const upperY = WAINSCOT_HEIGHT + upperHeight / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, 0, centerZ]} material={toonTextured(floor)} receiveShadow>
        <planeGeometry args={[width, depth]} />
      </mesh>

      {/* Daylight falling through the windows onto the floor. */}
      {WINDOW_ZS.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0.25]} position={[ROOM.maxX - 2.4, 0.004, z + 0.5]} material={unlit("#fff4c9", 0.22)}>
          <planeGeometry args={[3.6, 2.2]} />
        </mesh>
      ))}

      <mesh position={[centerX, ROOM.height, centerZ]} rotation={[Math.PI / 2, 0, 0]} material={toon(CEILING)}>
        <planeGeometry args={[width, depth]} />
      </mesh>

      {/* Walls: painted block over a wainscot band, with a trim rail between. */}
      {(
        [
          { position: [centerX, 0, ROOM.minZ], rotation: 0, length: width, texture: walls.wide },
          { position: [centerX, 0, ROOM.maxZ], rotation: Math.PI, length: width, texture: walls.wide },
          { position: [ROOM.minX, 0, centerZ], rotation: Math.PI / 2, length: depth, texture: walls.long },
          { position: [ROOM.maxX, 0, centerZ], rotation: -Math.PI / 2, length: depth, texture: walls.long },
        ] as const
      ).map(({ position, rotation, length, texture }, index) => (
        <group key={index} position={position as unknown as [number, number, number]} rotation={[0, rotation, 0]}>
          <mesh position={[0, upperY, 0]} material={toonTextured(texture)} receiveShadow>
            <planeGeometry args={[length, upperHeight]} />
          </mesh>
          <mesh position={[0, WAINSCOT_HEIGHT / 2, 0]} material={toon(WAINSCOT)} receiveShadow>
            <planeGeometry args={[length, WAINSCOT_HEIGHT]} />
          </mesh>
          <mesh position={[0, WAINSCOT_HEIGHT, 0.03]} material={toon(TRIM)}>
            <boxGeometry args={[length, 0.08, 0.06]} />
          </mesh>
          <mesh position={[0, 0.06, 0.02]} material={toon("#4f7f72")}>
            <boxGeometry args={[length, 0.12, 0.04]} />
          </mesh>
        </group>
      ))}

      <Windows />
      <Doors />
      <CeilingLights />
      <Stage />
    </group>
  );
}

function Windows() {
  const outside = outsideTexture();
  return (
    <group position={[ROOM.maxX - 0.02, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {WINDOW_ZS.map((z, index) => (
        <group key={z} position={[-z, 2.35, 0]}>
          <mesh material={unlit("#ffffff")} position={[0, 0, 0.005]}>
            <planeGeometry args={[2.3, 2.1]} />
            <meshBasicMaterial map={outside} map-offset={[index * 0.2, 0]} map-repeat={[0.22, 1]} toneMapped={false} />
          </mesh>
          {/* frame and mullions */}
          {[
            [0, 1.08, 2.46, 0.12],
            [0, -1.08, 2.46, 0.16],
            [-1.18, 0, 0.12, 2.2],
            [1.18, 0, 0.12, 2.2],
            [0, 0, 0.07, 2.1],
            [0, 0.2, 2.3, 0.07],
          ].map(([x, y, frameWidth, frameHeight], frameIndex) => (
            <mesh key={frameIndex} position={[x!, y!, 0.04]} material={toon(WINDOW_FRAME)}>
              <boxGeometry args={[frameWidth!, frameHeight!, 0.07]} />
            </mesh>
          ))}
          {/* sill */}
          <mesh position={[0, -1.2, 0.12]} material={toon(WINDOW_FRAME)} castShadow>
            <boxGeometry args={[2.6, 0.06, 0.26]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Doors() {
  const exitSign = signTexture("exit", { lines: ["EXIT"], background: "#1f7a4d", color: "#eafff2", width: 256, height: 96, radius: 8 });
  return (
    <group position={[ROOM.minX + 0.02, 0, 3.2]} rotation={[0, Math.PI / 2, 0]}>
      {[-0.6, 0.6].map((x) => (
        <group key={x} position={[x, 1.1, 0.03]}>
          <mesh material={toon("#4a7fa5")}>
            <boxGeometry args={[1.14, 2.2, 0.06]} />
          </mesh>
          <mesh position={[0, 0.45, 0.035]} material={unlit("#cfe6f2")}>
            <planeGeometry args={[0.4, 0.6]} />
          </mesh>
          <mesh position={[x > 0 ? -0.4 : 0.4, 0, 0.06]} material={toon("#c9ccd1")}>
            <boxGeometry args={[0.06, 0.3, 0.05]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.25, 0.02]} material={toon(TRIM)}>
        <boxGeometry args={[2.5, 0.1, 0.06]} />
      </mesh>
      <mesh position={[0, 2.6, 0.05]}>
        <planeGeometry args={[0.6, 0.225]} />
        <meshBasicMaterial map={exitSign} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CeilingLights() {
  const rows = [-12, -8, -4, 0, 4];
  const columns = [-7, -2.3, 2.3, 7];
  return (
    <group>
      {rows.flatMap((z) =>
        columns.map((x) => (
          <group key={`${x}:${z}`} position={[x, ROOM.height - 0.04, z]}>
            <mesh material={toon("#e6e1d6")}>
              <boxGeometry args={[0.7, 0.06, 1.5]} />
            </mesh>
            <mesh position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]} material={unlit("#fffdf2")}>
              <planeGeometry args={[0.6, 1.4]} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

function Stage() {
  const stageWidth = STAGE.toX - STAGE.fromX;
  const stageCenterX = (STAGE.toX + STAGE.fromX) / 2;
  const banner = signTexture("concert", {
    lines: ["SPRING CONCERT", "Friday · 6 pm · everyone welcome"],
    background: "#fbf3dc",
    color: "#8c2f22",
    width: 1024,
    height: 220,
    border: "#e8a33d",
  });
  return (
    <group position={[stageCenterX, 0, ROOM.minZ + STAGE.depth / 2]}>
      <RoundedBox args={[stageWidth, STAGE.height, STAGE.depth]} radius={0.03} smoothness={2} position={[0, STAGE.height / 2, 0]} material={toon(STAGE_WOOD)} castShadow receiveShadow />
      <mesh position={[0, STAGE.height - 0.08, STAGE.depth / 2 + 0.005]} material={toon("#9c6c3e")}>
        <planeGeometry args={[stageWidth, 0.12]} />
      </mesh>
      {/* steps */}
      {[0, 1, 2].map((step) => (
        <mesh key={step} position={[-stageWidth / 2 + 0.6, (step + 1) * (STAGE.height / 4) - STAGE.height / 8, STAGE.depth / 2 + 0.55 - step * 0.25]} material={toon(STAGE_WOOD)} castShadow receiveShadow>
          <boxGeometry args={[0.9, STAGE.height / 4, 0.25 * (3 - step) + 0.02]} />
        </mesh>
      ))}
      {/* proscenium curtains, gathered at the sides, and a valance */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (stageWidth / 2 - 0.55), STAGE.height, STAGE.depth / 2 - 0.3]}>
          {[0, 1, 2, 3].map((fold) => (
            <mesh key={fold} position={[side * (fold * 0.2 - 0.3), (ROOM.height - STAGE.height) / 2, (fold % 2) * 0.06]} material={toon(CURTAIN)} castShadow>
              <cylinderGeometry args={[0.13, 0.17, ROOM.height - STAGE.height, 10]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, ROOM.height - 0.35, STAGE.depth / 2 - 0.25]} material={toon(CURTAIN)}>
        <boxGeometry args={[stageWidth, 0.7, 0.15]} />
      </mesh>
      <mesh position={[0, 2.6, -STAGE.depth / 2 + 0.05]}>
        <planeGeometry args={[4.2, 0.9]} />
        <meshToonMaterial map={banner} />
      </mesh>
      {/* music stands and chairs left from rehearsal */}
      {[-1.8, -0.6, 0.6, 1.8].map((x, index) => (
        <group key={x} position={[x, STAGE.height, -0.2 + (index % 2) * 0.3]}>
          <mesh position={[0, 0.25, 0]} material={toon("#d94f3d")} castShadow>
            <boxGeometry args={[0.4, 0.05, 0.4]} />
          </mesh>
          <mesh position={[0, 0.5, -0.19]} material={toon("#d94f3d")}>
            <boxGeometry args={[0.4, 0.45, 0.04]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} material={toon("#555b61")}>
            <boxGeometry args={[0.36, 0.24, 0.36]} />
          </mesh>
          <mesh position={[0, 0.55, 0.5]} material={toon("#2f3338")}>
            <cylinderGeometry args={[0.012, 0.012, 1.1, 6]} />
          </mesh>
          <mesh position={[0, 1.08, 0.48]} rotation={[-0.4, 0, 0]} material={toon("#2f3338")}>
            <boxGeometry args={[0.45, 0.3, 0.015]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
