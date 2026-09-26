import { Html, RoundedBox } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type Group } from "three";
import type { TrayView } from "@eat.io/protocol";
import { toon, unlit } from "../materials.js";
import { FoodItem3D } from "./FoodItem3D.js";
import {
  EATEN_TRAY_TARGET,
  TRAY_DIMENSIONS,
  trayFacing,
  traySlotPosition,
  traySpawnPosition,
  type Side,
} from "./tableLayout.js";
import { TRAY_WELLS, trayFood } from "./trayFood.js";

const PLASTIC = "#f3ecdc";
const WELL = "#e2d9c4";
const SEAT_ACCENT: Record<Side, string> = { near: "#d94f3d", far: "#4a7fa5" };
const SELECTED_GLOW = "#ffd34d";
const MILLIMETERS = 0.001;

export interface Tray3DProps {
  tray: TrayView;
  side: Side;
  /** Index from the front of the table (0 is eaten next). */
  slot: number;
  slotCount: number;
  /** Arrived this round, so it slides on from the foot of the table instead of appearing in place. */
  fresh: boolean;
  /** Departing — carried to the eater and shrunk away. */
  eaten: boolean;
  selected: boolean;
  /** 1-based pick order, shown only for multi-target cards. */
  order: number | null;
  showLabel: boolean;
  onClick?: () => void;
}

export function Tray3D({ tray, side, slot, slotCount, fresh, eaten, selected, order, showLabel, onClick }: Tray3DProps) {
  const group = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const food = useMemo(() => trayFood(tray.id, tray.value), [tray.id, tray.value]);

  // Only the first render decides where the tray starts; after that it eases on its own.
  const [startPosition] = useState(
    () => new Vector3(...(fresh ? traySpawnPosition(side, slotCount) : traySlotPosition(side, slot))),
  );
  const [startScale] = useState(fresh ? 0.6 : 1);
  const target = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (eaten) {
      target.set(...EATEN_TRAY_TARGET);
    } else {
      target.set(...traySlotPosition(side, slot));
      if (selected) target.y += 0.06;
      else if (hovered && onClick) target.y += 0.02;
    }
    // Frame-rate independent easing: fast enough to feel responsive, soft enough to read as a slide.
    const speed = eaten ? 7 : 6;
    node.position.x = MathUtils.damp(node.position.x, target.x, speed, delta);
    node.position.y = MathUtils.damp(node.position.y, target.y, speed * 1.5, delta);
    node.position.z = MathUtils.damp(node.position.z, target.z, speed, delta);
    const scaleTarget = eaten ? 0.15 : 1;
    node.scale.setScalar(MathUtils.damp(node.scale.x, scaleTarget, eaten ? 5 : 8, delta));
  });

  // A tray that stops being clickable (turn submitted, board frozen) or leaves the table
  // must not leave the pointer cursor behind.
  // Only the tray that set the cursor clears it, so a tray arriving elsewhere cannot.
  const clickable = onClick !== undefined;
  const ownsCursor = useRef(false);
  const releaseCursor = () => {
    if (!ownsCursor.current) return;
    ownsCursor.current = false;
    document.body.style.cursor = "";
  };
  useEffect(() => {
    if (clickable) return;
    setHovered(false);
    releaseCursor();
  }, [clickable]);
  useEffect(() => releaseCursor, []);

  const pointerHandlers = onClick
    ? {
        onClick: (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onClick();
        },
        onPointerOver: (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
          ownsCursor.current = true;
          document.body.style.cursor = "pointer";
        },
        onPointerOut: () => {
          setHovered(false);
          releaseCursor();
        },
      }
    : {};

  return (
    <group ref={group} position={startPosition} scale={startScale}>
      <group rotation={[0, trayFacing(side), 0]}>
        <group {...pointerHandlers}>
          <RoundedBox
            args={[TRAY_DIMENSIONS.length, TRAY_DIMENSIONS.height, TRAY_DIMENSIONS.depth]}
            radius={0.012}
            smoothness={2}
            material={toon(PLASTIC)}
            castShadow
            receiveShadow
          />
          {/* A seat-colored lip along the tray's near edge says whose tray it is. */}
          <mesh position={[0, 0.004, TRAY_DIMENSIONS.depth / 2 - 0.012]} material={toon(SEAT_ACCENT[side])}>
            <boxGeometry args={[TRAY_DIMENSIONS.length - 0.03, TRAY_DIMENSIONS.height, 0.014]} />
          </mesh>
          {TRAY_WELLS.map((well, index) => (
            <mesh
              key={index}
              position={[well.centerX, TRAY_DIMENSIONS.height / 2 + 0.0005, well.centerZ]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={toon(WELL)}
              receiveShadow
            >
              <planeGeometry args={[well.width * MILLIMETERS + 0.012, well.height * MILLIMETERS + 0.012]} />
            </mesh>
          ))}
        </group>

        {selected && (
          <mesh position={[0, -TRAY_DIMENSIONS.height / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={unlit(SELECTED_GLOW, 0.85)}>
            <planeGeometry args={[TRAY_DIMENSIONS.length + 0.06, TRAY_DIMENSIONS.depth + 0.06]} />
          </mesh>
        )}

        <group position={[0, TRAY_DIMENSIONS.height / 2, 0]} visible={!eaten}>
          {food.items.map((item) => (
            <FoodItem3D key={item.key} item={item} />
          ))}
        </group>
      </group>

      {showLabel && !eaten && (
        <Html
          position={[0, 0.02, side === "near" ? TRAY_DIMENSIONS.depth / 2 + 0.07 : -TRAY_DIMENSIONS.depth / 2 - 0.07]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className={`tray-pill tray-pill--${side}${selected ? " tray-pill--selected" : ""}`}>
            {tray.value}
            {food.overflow > 0 && <span className="tray-pill__overflow">+{food.overflow} more</span>}
          </div>
        </Html>
      )}
      {order !== null && !eaten && (
        <Html position={[0, 0.12, 0]} center zIndexRange={[21, 0]} style={{ pointerEvents: "none" }}>
          <div className="tray-order">{order}</div>
        </Html>
      )}
    </group>
  );
}
