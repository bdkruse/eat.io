import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import { BoxGeometry, CapsuleGeometry, CircleGeometry, CylinderGeometry, SphereGeometry, type Group } from "three";
import { visibleClothing, type Appearance } from "../../appearance/appearance.js";
import { sharedGeometry, toon, unlit } from "../materials.js";
import { ThighCuff, TorsoClothing, WaistClothing } from "./KidClothing.js";
import { BowTie } from "./KidExtras.js";
import { KidHead, type KidHeadHandles } from "./KidHead.js";
import { legCovering, type Covering } from "./legCovering.js";
import { computeJoints, type Animation, type Pose } from "./poses.js";

/** Height of the bench seat a sitting kid rests on. */
export const BENCH_HEIGHT = 0.4;

const capsule = (radius: number, length: number) =>
  sharedGeometry(`capsule:${radius}:${length}`, () => new CapsuleGeometry(radius, length, 6, 12));
const sphere = (radius: number) => sharedGeometry(`sphere:${radius}:12`, () => new SphereGeometry(radius, 12, 9));
const pelvisGeometry = () => sharedGeometry("pelvis", () => new CylinderGeometry(0.135, 0.15, 0.13, 16));
const neckGeometry = () => sharedGeometry("neck", () => new CylinderGeometry(0.045, 0.05, 0.08, 10));
const blobGeometry = () => sharedGeometry("blob", () => new CircleGeometry(0.26, 20));
const carriedTrayGeometry = () => sharedGeometry("carriedTray", () => new BoxGeometry(0.4, 0.025, 0.3));
const forkGeometry = () => sharedGeometry("fork", () => new BoxGeometry(0.012, 0.16, 0.006));

/** Development only: `?kidDetail=low` (or `high`) draws every kid at that detail, so the
 *  low-detail kid can be checked up close on the Customize screen. */
const FORCED_KID_DETAIL: "high" | "low" | null = (() => {
  if (!import.meta.env.DEV) return null;
  const requested = new URLSearchParams(window.location.search).get("kidDetail");
  return requested === "high" || requested === "low" ? requested : null;
})();

const SHOE = "#f3efe6";
const SOLE = "#5a4f47";

export interface KidProps {
  appearance: Appearance;
  pose: Pose;
  animation: Animation;
  /** Offsets this kid's motion so a room of kids never moves in lockstep. */
  phase?: number;
  /** Background kids drop small face details they are too far away to show. */
  detail?: "high" | "low";
  position?: [number, number, number];
  rotation?: number;
  /** Cheap round shadow instead of a cast one — for the crowd. */
  blobShadow?: boolean;
  castShadow?: boolean;
  /** A lunch tray held in front, for kids walking to their table. */
  carrying?: boolean;
  /** The eater's fork and knife. */
  utensils?: boolean;
  /** A napkin tucked in as a bib. */
  bib?: boolean;
  /** Lunch staff wear an apron. */
  apron?: boolean;
  /** Overall size; lunch staff are grown-ups. */
  scale?: number;
  children?: ReactNode;
}

/**
 * A ten-year-old, built from rounded primitives. Proportions stay close to real — the head
 * a little large, nothing exaggerated — so the room reads as cartoon, not caricature.
 */
export function Kid({
  appearance,
  pose,
  animation,
  phase = 0,
  detail: requestedDetail = "high",
  position = [0, 0, 0],
  rotation = 0,
  blobShadow = false,
  castShadow = false,
  carrying = false,
  utensils = false,
  bib = false,
  apron = false,
  scale = 1,
  children,
}: KidProps) {
  const detail = FORCED_KID_DETAIL ?? requestedDetail;
  const body = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const neck = useRef<Group>(null);
  const rightShoulder = useRef<Group>(null);
  const rightElbow = useRef<Group>(null);
  const leftShoulder = useRef<Group>(null);
  const leftElbow = useRef<Group>(null);
  const rightHip = useRef<Group>(null);
  const rightKnee = useRef<Group>(null);
  const leftHip = useRef<Group>(null);
  const leftKnee = useRef<Group>(null);
  const handles = useRef<KidHeadHandles>({ mouthSmile: null, mouthOpen: null, eyes: null, ponytail: null });

  useFrame(({ clock }) => {
    const joints = computeJoints(pose, animation, clock.elapsedTime, phase);
    body.current?.position.set(0, joints.bodyLift + (pose === "sit" ? -0.03 : 0), 0);
    torso.current?.rotation.set(joints.torsoPitch, 0, joints.torsoRoll);
    neck.current?.rotation.set(joints.headPitch, joints.headYaw, joints.headRoll);
    rightShoulder.current?.rotation.set(joints.rightShoulderPitch, 0, joints.rightShoulderRoll);
    rightElbow.current?.rotation.set(joints.rightElbow, 0, 0);
    leftShoulder.current?.rotation.set(joints.leftShoulderPitch, 0, joints.leftShoulderRoll);
    leftElbow.current?.rotation.set(joints.leftElbow, 0, 0);
    rightHip.current?.rotation.set(joints.rightHip, 0, 0);
    rightKnee.current?.rotation.set(joints.rightKnee, 0, 0);
    leftHip.current?.rotation.set(joints.leftHip, 0, 0);
    leftKnee.current?.rotation.set(joints.leftKnee, 0, 0);

    const { mouthSmile, mouthOpen, eyes, ponytail } = handles.current;
    const open = joints.mouthOpen > 0.08;
    if (mouthSmile) mouthSmile.visible = !open;
    if (mouthOpen) {
      mouthOpen.visible = open;
      mouthOpen.scale.set(0.8 + joints.mouthOpen * 0.3, 0.25 + joints.mouthOpen * 0.95, 1);
    }
    if (eyes) eyes.scale.y = joints.eyeOpen;
    if (ponytail) ponytail.rotation.set(Math.sin(clock.elapsedTime * 2.2 + phase) * 0.12, 0, Math.sin(clock.elapsedTime * 1.7 + phase) * 0.15);
  });

  const shirt = toon(appearance.shirtColor);
  const pants = toon(appearance.pantsColor);
  const skin = toon(appearance.skinTone);
  const shoe = toon(SHOE);
  const sole = toon(SOLE);
  const clothing = visibleClothing(appearance);
  const covering = legCovering(clothing, pose === "sit");
  const coveringMaterial = { shirt, pants, skin } satisfies Record<Covering, unknown>;
  const pelvisMaterial = coveringMaterial[covering.pelvis];
  const thighMaterial = coveringMaterial[covering.thigh];
  const shinMaterial = coveringMaterial[covering.shin];

  const leg = (side: 1 | -1, hip: typeof rightHip, knee: typeof rightKnee) => (
    <group ref={hip} position={[side * 0.075, 0.46, 0]}>
      <mesh geometry={capsule(0.06, 0.13)} material={thighMaterial} position={[0, -0.1, 0]} castShadow={castShadow} />
      <ThighCuff cuff={covering.thighCuff} pantsColor={appearance.pantsColor} detail={detail} />
      <group ref={knee} position={[0, -0.21, 0]}>
        <mesh geometry={capsule(0.052, 0.12)} material={shinMaterial} position={[0, -0.08, 0]} castShadow={castShadow} />
        <group position={[0, -0.205, 0.035]}>
          <mesh geometry={sphere(0.06)} material={shoe} scale={[1, 0.62, 1.55]} castShadow={castShadow} />
          <mesh geometry={sphere(0.06)} material={sole} scale={[1.02, 0.25, 1.57]} position={[0, -0.025, 0]} />
        </group>
      </group>
    </group>
  );

  const arm = (side: 1 | -1, shoulder: typeof rightShoulder, elbow: typeof rightElbow, holdsFork: boolean) => (
    <group ref={shoulder} position={[side * 0.185, 0.35, 0]}>
      <mesh geometry={sphere(0.054)} material={shirt} />
      <mesh geometry={capsule(0.05, 0.07)} material={shirt} position={[0, -0.07, 0]} castShadow={castShadow} />
      <mesh geometry={capsule(0.042, 0.08)} material={skin} position={[0, -0.14, 0]} />
      <group ref={elbow} position={[0, -0.2, 0]}>
        <mesh geometry={capsule(0.04, 0.11)} material={skin} position={[0, -0.08, 0]} castShadow={castShadow} />
        <mesh geometry={sphere(0.05)} material={skin} position={[0, -0.18, 0.005]} />
        {utensils && holdsFork && (
          <mesh geometry={forkGeometry()} material={toon("#c9ccd1")} position={[0, -0.17, 0.05]} rotation={[-1.2, 0, 0]} />
        )}
      </group>
    </group>
  );

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {blobShadow && (
        <mesh geometry={blobGeometry()} material={unlit("#1f2a22", 0.16)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} />
      )}
      <group ref={body}>
        {leg(-1, rightHip, rightKnee)}
        {leg(1, leftHip, leftKnee)}
        <mesh geometry={pelvisGeometry()} material={pelvisMaterial} position={[0, 0.5, 0]} castShadow={castShadow} />
        <WaistClothing appearance={appearance} clothing={clothing} detail={detail} castShadow={castShadow} seated={pose === "sit"} />
        <group ref={torso} position={[0, 0.52, 0]}>
          <mesh geometry={capsule(0.15, 0.2)} material={shirt} position={[0, 0.19, 0]} scale={[1, 1, 0.82]} castShadow={castShadow} />
          <TorsoClothing appearance={appearance} clothing={clothing} detail={detail} castShadow={castShadow} />
          {bib && (
            <mesh geometry={sphere(0.12)} material={toon("#ffffff")} position={[0, 0.25, 0.1]} scale={[1, 1.1, 0.35]} />
          )}
          {apron && (
            <mesh geometry={sphere(0.13)} material={toon("#fbfaf6")} position={[0, 0.1, 0.085]} scale={[1.05, 1.6, 0.32]} />
          )}
          {appearance.accessory === "bowTie" && <BowTie shirtColor={appearance.shirtColor} />}
          {arm(-1, rightShoulder, rightElbow, true)}
          {arm(1, leftShoulder, leftElbow, true)}
          {carrying && (
            <group position={[0, 0.2, 0.3]}>
              <mesh geometry={carriedTrayGeometry()} material={toon("#e9dfc9")} castShadow={castShadow} />
              <mesh geometry={sphere(0.05)} material={toon("#e2a63d")} position={[-0.08, 0.03, 0]} scale={[1.4, 0.6, 1.2]} />
              <mesh geometry={sphere(0.035)} material={toon("#5f9e4a")} position={[0.1, 0.03, -0.06]} />
              <mesh geometry={sphere(0.035)} material={toon("#c9543f")} position={[0.12, 0.03, 0.07]} />
            </group>
          )}
          <group ref={neck} position={[0, 0.41, 0]}>
            <mesh geometry={neckGeometry()} material={skin} position={[0, 0.02, 0]} />
            <group position={[0, 0.2, 0]}>
              <KidHead appearance={appearance} detail={detail} handles={handles.current} />
            </group>
          </group>
        </group>
        {children}
      </group>
    </group>
  );
}
