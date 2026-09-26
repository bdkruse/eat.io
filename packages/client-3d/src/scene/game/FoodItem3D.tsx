import { memo } from "react";
import { CapsuleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from "three";
import { sharedGeometry, toon } from "../materials.js";
import type { FoodItem } from "./trayFood.js";

const nugget = () => sharedGeometry("food:nugget", () => new SphereGeometry(0.5, 10, 8));
const tot = () => sharedGeometry("food:tot", () => new CylinderGeometry(0.42, 0.42, 0.7, 10));
const ball = () => sharedGeometry("food:ball", () => new SphereGeometry(0.5, 12, 9));
const carrot = () => sharedGeometry("food:carrot", () => new ConeGeometry(0.28, 1, 8));
const floret = () => sharedGeometry("food:floret", () => new SphereGeometry(0.3, 8, 6));
const stalk = () => sharedGeometry("food:stalk", () => new CylinderGeometry(0.12, 0.16, 0.5, 6));
const cob = () => sharedGeometry("food:corn", () => new CapsuleGeometry(0.16, 0.2, 4, 8));

/** Food is drawn larger than its slot's strict footprint so it reads from the top-down camera. */
const VISIBILITY_SCALE = 1.65;

/**
 * One point of food. Each kind is a few primitives scaled to the slot's footprint, so a
 * full tray reads as a lunch at a glance even from the top-down game camera.
 */
export const FoodItem3D = memo(function FoodItem3D({ item }: { item: FoodItem }) {
  const size = item.size * VISIBILITY_SCALE;
  return (
    <group position={[item.x, 0, item.z]} rotation={[0, item.yaw, 0]} scale={size}>
      <FoodShape kind={item.kind} />
    </group>
  );
});

function FoodShape({ kind }: { kind: FoodItem["kind"] }) {
  switch (kind) {
    case "nugget":
      return <mesh geometry={nugget()} material={toon("#e0a043")} position={[0, 0.2, 0]} scale={[1, 0.45, 0.72]} castShadow />;
    case "tot":
      return <mesh geometry={tot()} material={toon("#e8b453")} position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow />;
    case "meatball":
      return <mesh geometry={ball()} material={toon("#9c4a32")} position={[0, 0.34, 0]} scale={0.85} castShadow />;
    case "carrot":
      return <mesh geometry={carrot()} material={toon("#e2703a")} position={[0, 0.16, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.9, 0.8, 0.9]} castShadow />;
    case "broccoli":
      return (
        <group>
          <mesh geometry={stalk()} material={toon("#8fbf6a")} position={[0, 0.2, 0]} />
          <mesh geometry={floret()} material={toon("#4f8c3c")} position={[0, 0.5, 0]} castShadow />
          <mesh geometry={floret()} material={toon("#5f9e4a")} position={[0.18, 0.44, 0.08]} scale={0.8} />
          <mesh geometry={floret()} material={toon("#5f9e4a")} position={[-0.16, 0.44, -0.08]} scale={0.8} />
        </group>
      );
    case "grape":
      return <mesh geometry={ball()} material={toon("#7d5ba6")} position={[0, 0.3, 0]} scale={[0.72, 0.62, 0.62]} castShadow />;
    case "corn":
      return <mesh geometry={cob()} material={toon("#ecc94b")} position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow />;
  }
}
