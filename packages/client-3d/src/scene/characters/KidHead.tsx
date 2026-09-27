import { forwardRef, useMemo } from "react";
import { CapsuleGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type Group } from "three";
import type { Appearance } from "../../appearance/appearance.js";
import { mixColor, sharedGeometry, toon } from "../materials.js";
import { HAT_ACCESSORIES, HeadExtra } from "./KidExtras.js";
import { Eye, INK, MOUTH, RestingMouth, WHITE } from "./KidFace.js";

export const HEAD_RADIUS = 0.17;

const sphere = (radius: number, detail = 16) =>
  sharedGeometry(`sphere:${radius}:${detail}`, () => new SphereGeometry(radius, detail, Math.max(8, detail * 0.75)));

/** Upper part of a sphere, `coverage` in units of PI measured down from the top. */
const cap = (radius: number, coverage: number) =>
  sharedGeometry(`cap:${radius}:${coverage}`, () => new SphereGeometry(radius, 24, 14, 0, Math.PI * 2, 0, Math.PI * coverage));

/** A sphere band with the front left open for the face. */
const shell = (radius: number, from: number, to: number, faceGap: number) =>
  sharedGeometry(`shell:${radius}:${from}:${to}:${faceGap}`, () => {
    // phi = PI/2 is +Z (the face) in SphereGeometry's parameterisation.
    const start = Math.PI / 2 + faceGap / 2;
    return new SphereGeometry(radius, 24, 12, start, Math.PI * 2 - faceGap, Math.PI * from, Math.PI * (to - from));
  });

const ringGeometry = () => sharedGeometry("lens", () => new TorusGeometry(0.04, 0.0065, 6, 20));
const bandGeometry = (radius: number, tube: number) =>
  sharedGeometry(`band:${radius}:${tube}`, () => new TorusGeometry(radius, tube, 8, 28));
const brimGeometry = () => sharedGeometry("brim", () => new CylinderGeometry(0.13, 0.13, 0.014, 24, 1, false, -Math.PI / 2, Math.PI));
const browGeometry = () => sharedGeometry("brow", () => new CapsuleGeometry(0.009, 0.035, 4, 6));
const tailGeometry = () => sharedGeometry("tail", () => new CapsuleGeometry(0.045, 0.13, 6, 10));

/** Points on the upper-back of the head for curly hair — fixed, so every curly kid matches. */
const CURL_POINTS: [number, number, number][] = (() => {
  const points: [number, number, number][] = [];
  const count = 44;
  for (let index = 0; index < count; index++) {
    const y = 1 - (index / (count - 1)) * 1.3;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * 2.399963;
    const x = Math.cos(angle) * ring;
    const z = Math.sin(angle) * ring;
    // Leave the face clear.
    if (z > 0.35 && y < 0.45) continue;
    if (y < -0.25 && z > -0.2) continue;
    points.push([x * 0.18, y * 0.18 + 0.01, z * 0.18 - 0.01]);
  }
  return points;
})();

export interface KidHeadProps {
  appearance: Appearance;
  detail: "high" | "low";
}

export interface KidHeadHandles {
  mouthSmile: Group | null;
  mouthOpen: Group | null;
  eyes: Group | null;
  ponytail: Group | null;
}

/** Hair, face, and extra. The mouth is its own group so it can chomp on its own. */
export const KidHead = forwardRef<Group, KidHeadProps & { handles: KidHeadHandles }>(function KidHead(
  { appearance, detail, handles },
  ref,
) {
  const skin = toon(appearance.skinTone);
  const hair = toon(appearance.hairColor, { doubleSided: true });
  const accessoryColor = appearance.shirtColor === "#f4f1ea" ? "#d94f3d" : appearance.shirtColor;
  const accessory = toon(accessoryColor, { doubleSided: true });
  const cheek = useMemo(() => toon(mixColor(appearance.skinTone, "#e8705f", 0.35)), [appearance.skinTone]);
  const brow = useMemo(() => toon(mixColor(appearance.hairColor, INK, 0.3)), [appearance.hairColor]);
  const wearingHat = HAT_ACCESSORIES.has(appearance.accessory);

  return (
    <group ref={ref}>
      <mesh geometry={sphere(HEAD_RADIUS, 24)} material={skin} castShadow />
      {/* ears */}
      <mesh geometry={sphere(0.04)} material={skin} position={[-0.165, -0.01, 0]} scale={[0.6, 1, 0.85]} />
      <mesh geometry={sphere(0.04)} material={skin} position={[0.165, -0.01, 0]} scale={[0.6, 1, 0.85]} />

      {/* eyes: the group sits at eye height so a blink closes each eye in place */}
      <group ref={(node) => void (handles.eyes = node)} position={[0, 0.02, 0]}>
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.06, 0, 0.152]}>
            <Eye shape={appearance.eyeShape} eyeColor={appearance.eyeColor} skinTone={appearance.skinTone} side={side} detail={detail} />
          </group>
        ))}
      </group>

      {detail === "high" && (
        <>
          {[-1, 1].map((side) => (
            <mesh
              key={`brow${side}`}
              geometry={browGeometry()}
              material={brow}
              position={[side * 0.062, 0.078, 0.148]}
              rotation={[0.2, 0, Math.PI / 2 + side * 0.12]}
            />
          ))}
          {[-1, 1].map((side) => (
            <mesh
              key={`cheek${side}`}
              geometry={sphere(0.03, 10)}
              material={cheek}
              position={[side * 0.097, -0.035, 0.128]}
              scale={[1, 0.7, 0.4]}
            />
          ))}
          <mesh geometry={sphere(0.022, 10)} material={skin} position={[0, -0.018, 0.167]} />
        </>
      )}

      {/* mouth: the chosen shape at rest, an opening when talking or chomping */}
      <group position={[0, -0.068, 0.155]}>
        <group ref={(node) => void (handles.mouthSmile = node)}>
          <RestingMouth shape={appearance.mouthShape} detail={detail} />
        </group>
        <group ref={(node) => void (handles.mouthOpen = node)} visible={false}>
          <mesh geometry={sphere(0.042, 14)} material={toon(MOUTH)} scale={[1, 1, 0.45]} />
        </group>
      </group>

      <Hair appearance={appearance} hair={hair} wearingHat={wearingHat} handles={handles} />

      {appearance.accessory === "glasses" && (
        <group position={[0, 0.02, 0.176]}>
          <mesh geometry={ringGeometry()} material={toon(INK)} position={[-0.062, 0, 0]} />
          <mesh geometry={ringGeometry()} material={toon(INK)} position={[0.062, 0, 0]} />
          <mesh geometry={browGeometry()} material={toon(INK)} rotation={[0, 0, Math.PI / 2]} scale={[0.7, 0.4, 0.7]} />
        </group>
      )}

      {appearance.accessory === "cap" && (
        <group rotation={[-0.12, 0, 0]}>
          <mesh geometry={cap(0.192, 0.5)} material={accessory} position={[0, 0.012, 0]} castShadow />
          <mesh geometry={brimGeometry()} material={accessory} position={[0, 0.075, 0.1]} rotation={[0.08, 0, 0]} scale={[1, 1, 1.25]} />
          <mesh geometry={sphere(0.018, 8)} material={accessory} position={[0, 0.205, 0]} />
        </group>
      )}

      {appearance.accessory === "headband" && (
        <mesh geometry={bandGeometry(0.176, 0.013)} material={accessory} position={[0, 0.06, -0.015]} rotation={[Math.PI / 2 - 0.55, 0, 0]} />
      )}

      {appearance.accessory === "beanie" && (
        <group rotation={[-0.15, 0, 0]}>
          <mesh geometry={cap(0.196, 0.47)} material={accessory} position={[0, 0.02, 0]} castShadow />
          <mesh geometry={bandGeometry(0.188, 0.026)} material={accessory} position={[0, 0.035, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={sphere(0.05, 12)} material={toon(WHITE)} position={[0, 0.23, 0]} />
        </group>
      )}

      <HeadExtra accessory={appearance.accessory} color={accessoryColor} detail={detail} />
    </group>
  );
});

function Hair({
  appearance,
  hair,
  wearingHat,
  handles,
}: {
  appearance: Appearance;
  hair: ReturnType<typeof toon>;
  wearingHat: boolean;
  handles: KidHeadHandles;
}) {
  switch (appearance.hairStyle) {
    case "short":
      return (
        <>
          <mesh geometry={cap(0.182, 0.52)} material={hair} rotation={[-0.42, 0, 0]} castShadow />
          {!wearingHat && (
            <mesh geometry={sphere(0.08, 12)} material={hair} position={[0.03, 0.13, 0.1]} scale={[1.6, 0.55, 0.9]} rotation={[0.5, 0, -0.25]} />
          )}
        </>
      );

    case "bob":
      return (
        <>
          <mesh geometry={cap(0.186, 0.5)} material={hair} rotation={[-0.25, 0, 0]} castShadow />
          <mesh geometry={shell(0.197, 0.28, 0.66, 1.9)} material={hair} position={[0, -0.005, -0.005]} castShadow />
          {!wearingHat && (
            <mesh geometry={sphere(0.1, 14)} material={hair} position={[0, 0.115, 0.1]} scale={[1.55, 0.5, 0.8]} rotation={[0.55, 0, 0]} />
          )}
        </>
      );

    case "curly":
      return (
        <>
          <mesh geometry={cap(0.18, 0.5)} material={hair} rotation={[-0.3, 0, 0]} />
          {/* Under a hat only the curls below the brim line show. */}
          {CURL_POINTS.filter((point) => !wearingHat || point[1] < 0.04).map((point, index) => (
            <mesh key={index} geometry={sphere(0.052, 10)} material={hair} position={point} castShadow={index % 4 === 0} />
          ))}
        </>
      );

    case "ponytail":
      return (
        <>
          <mesh geometry={cap(0.184, 0.54)} material={hair} rotation={[-0.3, 0, 0]} castShadow />
          <mesh geometry={sphere(0.028, 8)} material={toon("#e07a9a")} position={[0, 0.07, -0.18]} />
          <group ref={(node) => void (handles.ponytail = node)} position={[0, 0.07, -0.19]}>
            <mesh geometry={tailGeometry()} material={hair} position={[0, -0.1, -0.03]} rotation={[0.3, 0, 0]} castShadow />
          </group>
        </>
      );

    case "buzz":
      return <mesh geometry={cap(0.175, 0.5)} material={hair} rotation={[-0.5, 0, 0]} />;

    case "puffs":
      return (
        <>
          <mesh geometry={cap(0.182, 0.5)} material={hair} rotation={[-0.3, 0, 0]} castShadow />
          {!wearingHat && (
            <>
              <mesh geometry={sphere(0.095, 14)} material={hair} position={[-0.13, 0.13, -0.03]} castShadow />
              <mesh geometry={sphere(0.095, 14)} material={hair} position={[0.13, 0.13, -0.03]} castShadow />
            </>
          )}
        </>
      );
  }
}
