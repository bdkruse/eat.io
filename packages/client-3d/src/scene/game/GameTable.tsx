import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { MathUtils, type Group } from "three";
import type { Result, RoomStateMessage, TrayView } from "@eat.io/protocol";
import { useBoostedTray } from "../../hooks/useBoostedTray.js";
import { useEatenTrays } from "../../hooks/useEatenTrays.js";
import type { Selection } from "../../state/selection.js";
import type { TutorialAnchor } from "../../tutorial/tutorialSteps.js";
import { appearanceFromName, type Appearance } from "../../appearance/appearance.js";
import { LunchTable } from "../cafeteria/LunchTable.js";
import { CUSTOMIZE_SPOT } from "../cameraShots.js";
import { BENCH_HEIGHT, Kid } from "../characters/Kid.js";
import type { Animation, Pose } from "../characters/poses.js";
import { toon, unlit } from "../materials.js";
import { ServingsMarker } from "./ServingsMarker.js";
import {
  EATER_FACING,
  EATER_POSITION,
  SEAT_FACING,
  SEAT_POSITION,
  TABLE_DIMENSIONS,
  type Side,
  type Vector3Tuple,
} from "./tableLayout.js";
import { SELECTED_GLOW, Tray3D } from "./Tray3D.js";

/** The eater is the same kid every game: hungry, napkin tucked in, fork at the ready. */
const EATER_LOOK: Appearance = {
  skinTone: "#d9a47a",
  hairStyle: "curly",
  hairColor: "#3d2a1e",
  shirtColor: "#e8a33d",
  pantsColor: "#444a52",
  accessory: "none",
  eyeShape: "round",
  eyeColor: "#3b2417",
  mouthShape: "smile",
  top: "tee",
  bottom: "pants",
  onePiece: "none",
  graphic: "star",
};

export interface GameTableProps {
  room: RoomStateMessage | null;
  result: Result | null;
  yourAppearance: Appearance;
  /** On the customize screen, or while the profile panel is open, your kid gets up and
   *  stands where the camera can see them (§11). */
  showingKid: boolean;
  awaitingYou: boolean;
  selection: Selection;
  targetCount: number;
  /** False while frozen, waiting on the opponent, or after the game — trays ignore clicks. */
  interactive: boolean;
  showLabels: boolean;
  /** What the practice game's prompt points at, or null. */
  tutorialAnchor: TutorialAnchor;
  onTrayClick: (trayId: string) => void;
}

export function GameTable({
  room,
  result,
  yourAppearance,
  showingKid,
  awaitingYou,
  selection,
  targetCount,
  interactive,
  showLabels,
  tutorialAnchor,
  onTrayClick,
}: GameTableProps) {
  const yourAnimation: Animation = result
    ? result.kind === "loss"
      ? "slump"
      : "cheer"
    : room
      ? awaitingYou
        ? "think"
        : "idle"
      : showingKid
        ? "wave"
        : "idle";

  return (
    <group>
      <LunchTable
        length={TABLE_DIMENSIONS.length}
        width={TABLE_DIMENSIONS.width}
        height={TABLE_DIMENSIONS.height}
        benchOffset={SEAT_POSITION.near[2]}
        topColor="#bcd6c6"
        nearBench="#e0705f"
        farBench="#6a98ba"
      />

      {/* the eater's stool at the head of the table */}
      <group position={[EATER_POSITION[0], 0, EATER_POSITION[2]]}>
        <mesh position={[0, BENCH_HEIGHT - 0.03, 0]} material={toon("#e8a33d")} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.06, 20]} />
        </mesh>
        <mesh position={[0, (BENCH_HEIGHT - 0.06) / 2, 0]} material={toon("#aab1b6")}>
          <cylinderGeometry args={[0.03, 0.05, BENCH_HEIGHT - 0.06, 10]} />
        </mesh>
      </group>

      <YourKid appearance={yourAppearance} showingKid={showingKid && !room} animation={yourAnimation} />

      {room ? (
        <RoomLayer
          room={room}
          result={result}
          selection={selection}
          targetCount={targetCount}
          interactive={interactive}
          showLabels={showLabels}
          tutorialAnchor={tutorialAnchor}
          onTrayClick={onTrayClick}
        />
      ) : (
        // Between games the eater chats with whoever is sitting at the table.
        <Eater animation="chat" />
      )}
    </group>
  );
}

function Eater({ animation }: { animation: Animation }) {
  return (
    <Kid appearance={EATER_LOOK} pose="sit" animation={animation} phase={0.5} position={EATER_POSITION} rotation={EATER_FACING} castShadow utensils bib />
  );
}

/** A pulsing gold ring on the floor around the eater's stool, while the practice game's
 *  prompt points at the eater. */
function EaterHighlight() {
  const ring = useRef<Group>(null);
  useFrame(({ clock }) => {
    ring.current?.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.08);
  });
  return (
    <group ref={ring} position={[EATER_POSITION[0], 0.01, EATER_POSITION[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={unlit(SELECTED_GLOW, 0.85)}>
        <ringGeometry args={[0.42, 0.55, 40]} />
      </mesh>
    </group>
  );
}

/**
 * Everything that exists only while a room does. Mounted per room, so the eaten-tray
 * memory can never carry over into the next game — tray ids restart with every room.
 */
function RoomLayer({
  room,
  result,
  selection,
  targetCount,
  interactive,
  showLabels,
  tutorialAnchor,
  onTrayClick,
}: {
  room: RoomStateMessage;
  result: Result | null;
  selection: Selection;
  targetCount: number;
  interactive: boolean;
  showLabels: boolean;
  tutorialAnchor: TutorialAnchor;
  onTrayClick: (trayId: string) => void;
}) {
  const yourTrays = useEatenTrays(room.you.table);
  const opponentTrays = useEatenTrays(room.opponent.table);
  const biting = yourTrays.biting || opponentTrays.biting;
  const yourBoostedTrayId = useBoostedTray(room.you.table);
  const opponentBoostedTrayId = useBoostedTray(room.opponent.table);
  // A logged-in opponent's saved look wins; otherwise the same name-derived look as a
  // guest opponent always gets (§11).
  const opponentLook = useMemo(
    () => room.opponent.appearance ?? appearanceFromName(room.opponent.name),
    [room.opponent.appearance, room.opponent.name],
  );

  const opponentAnimation: Animation = result
    ? result.kind === "win"
      ? "slump"
      : "cheer"
    : room.opponent.submitted
      ? "idle"
      : "think";

  return (
    <>
      <Eater animation={biting ? "chomp" : result ? "listen" : "hungry"} />
      {tutorialAnchor === "eater" && <EaterHighlight />}
      <Kid
        appearance={opponentLook}
        pose="sit"
        animation={opponentAnimation}
        phase={0.83}
        position={SEAT_POSITION.far}
        rotation={SEAT_FACING.far}
        castShadow
      />

      {/* Only the opponent needs a tag; your own kid is the one nearest you. */}
      {showLabels && <NameTag name={room.opponent.name} ready={room.opponent.submitted && !result} />}

      <TrayRow
        side="near"
        trays={yourTrays.rendered}
        eatenIds={yourTrays.eatenIds}
        live={room.you.table}
        selection={selection}
        targetCount={targetCount}
        showLabels={showLabels}
        boostedTrayId={yourBoostedTrayId}
        highlighted={tutorialAnchor === "trays" || tutorialAnchor === "tray-target"}
        onTrayClick={interactive ? onTrayClick : undefined}
      />
      <TrayRow
        side="far"
        trays={opponentTrays.rendered}
        eatenIds={opponentTrays.eatenIds}
        live={room.opponent.table}
        selection={null}
        targetCount={0}
        showLabels={showLabels}
        boostedTrayId={opponentBoostedTrayId}
      />
      <ServingsMarker
        side="near"
        slotCount={room.you.table.length}
        extraServings={room.you.extraServings}
        highlighted={tutorialAnchor === "servings-marker"}
      />
      <ServingsMarker side="far" slotCount={room.opponent.table.length} extraServings={room.opponent.extraServings} />
    </>
  );
}


function TrayRow({
  side,
  trays,
  eatenIds,
  live,
  selection,
  targetCount,
  showLabels,
  boostedTrayId,
  highlighted = false,
  onTrayClick,
}: {
  side: Side;
  trays: TrayView[];
  eatenIds: Set<string>;
  live: TrayView[];
  selection: Selection | null;
  targetCount: number;
  showLabels: boolean;
  boostedTrayId?: string | null;
  highlighted?: boolean;
  onTrayClick?: ((trayId: string) => void) | undefined;
}) {
  // Trays already on the table when this row first renders start in place; any tray seen
  // for the first time after that has just been served and slides on from the foot.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    seen.current ??= new Set();
    for (const tray of trays) seen.current.add(tray.id);
  }, [trays]);

  return (
    <>
      {trays.map((tray) => {
        const eaten = eatenIds.has(tray.id);
        const slot = eaten ? -1 : live.findIndex((liveTray) => liveTray.id === tray.id);
        const position = selection ? selection.targetTrayIds.indexOf(tray.id) : -1;
        return (
          <Tray3D
            key={tray.id}
            tray={tray}
            side={side}
            slot={Math.max(0, slot)}
            slotCount={live.length}
            fresh={seen.current !== null && !seen.current.has(tray.id)}
            eaten={eaten}
            boosted={boostedTrayId === tray.id}
            highlighted={highlighted}
            selected={position >= 0}
            order={position >= 0 && targetCount > 1 ? position + 1 : null}
            showLabel={showLabels}
            {...(onTrayClick && !eaten ? { onClick: () => onTrayClick(tray.id) } : {})}
          />
        );
      })}
    </>
  );
}

function NameTag({ name, ready }: { name: string; ready: boolean }) {
  const [x, , z] = SEAT_POSITION.far;
  // Beside the head rather than above it, so the top-down shot keeps it on screen.
  return (
    <Html position={[x + 0.5, 1.15, z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className="name-tag name-tag--far">
        {name}
        {ready && <span className="name-tag__ready">ready</span>}
      </div>
    </Html>
  );
}

/**
 * Your kid: seated at the near side of the game table, or — on the customize screen, or
 * while the profile panel is open — up and standing where the camera can get a good look,
 * walking between the two.
 */
function YourKid({ appearance, showingKid, animation }: { appearance: Appearance; showingKid: boolean; animation: Animation }) {
  const group = useRef<Group>(null);
  const turntable = useRef<Group>(null);
  const target: Vector3Tuple = showingKid ? CUSTOMIZE_SPOT : SEAT_POSITION.near;
  const movement = useRef({ walking: false });

  useFrame(({ clock }, delta) => {
    const node = group.current;
    if (!node) return;
    const dx = target[0] - node.position.x;
    const dz = target[2] - node.position.z;
    const distance = Math.hypot(dx, dz);
    const walking = distance > 0.04;
    if (walking) {
      // Walk at a kid's pace, facing where they are going.
      const step = Math.min(distance, delta * 1.6);
      node.position.x += (dx / distance) * step;
      node.position.z += (dz / distance) * step;
      const heading = Math.atan2(dx, dz);
      node.rotation.y = MathUtils.damp(node.rotation.y, nearestAngle(node.rotation.y, heading), 10, delta);
    } else {
      const facing = showingKid ? 0 : SEAT_FACING.near;
      node.rotation.y = MathUtils.damp(node.rotation.y, nearestAngle(node.rotation.y, facing), 6, delta);
    }
    if (turntable.current) {
      // A slow sway on the customize spot so the whole outfit is seen.
      const sway = showingKid && !walking ? Math.sin(clock.elapsedTime * 0.6) * 0.55 : 0;
      turntable.current.rotation.y = MathUtils.damp(turntable.current.rotation.y, sway, 3, delta);
    }
    movement.current.walking = walking;
  });

  return (
    <group ref={group} position={SEAT_POSITION.near} rotation={[0, SEAT_FACING.near, 0]}>
      <group ref={turntable}>
        <WalkAwareKid appearance={appearance} animation={animation} restingPose={showingKid ? "stand" : "sit"} movement={movement} />
      </group>
    </group>
  );
}

/** Swaps to the walk cycle while the parent group is moving, without re-rendering React. */
function WalkAwareKid({
  appearance,
  animation,
  restingPose,
  movement,
}: {
  appearance: Appearance;
  animation: Animation;
  restingPose: Pose;
  movement: RefObject<{ walking: boolean }>;
}) {
  const walkingGroup = useRef<Group>(null);
  const restingGroup = useRef<Group>(null);
  useFrame(() => {
    const walking = movement.current?.walking ?? false;
    if (walkingGroup.current) walkingGroup.current.visible = walking;
    if (restingGroup.current) restingGroup.current.visible = !walking;
  });
  return (
    <>
      <group ref={restingGroup}>
        <Kid appearance={appearance} pose={restingPose} animation={animation} phase={0.1} castShadow />
      </group>
      <group ref={walkingGroup} visible={false}>
        <Kid appearance={appearance} pose="walk" animation="idle" phase={0.1} castShadow />
      </group>
    </>
  );
}

function nearestAngle(from: number, to: number): number {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference;
}
