/**
 * Where everything sits on the game table, in meters, relative to the table's center on
 * the floor. The table's long axis is X; the eater sits at the +X head. Your seat is the
 * near side (+Z, toward the camera), the opponent's the far side (-Z).
 */

export type Side = "near" | "far";
export type Vector3Tuple = [number, number, number];

export const TABLE_DIMENSIONS = {
  length: 3.1,
  width: 1.15,
  height: 0.66,
  topThickness: 0.06,
} as const;

export const TRAY_DIMENSIONS = { length: 0.46, depth: 0.34, height: 0.03 } as const;

/** Distance between neighbouring tray centers along the table. */
const TRAY_PITCH = 0.53;
/** Center of the front tray (slot 0), the one that is eaten next. */
const FRONT_TRAY_X = 1.12;
const TRAY_ROW_Z = 0.27;

export const EATER_POSITION: Vector3Tuple = [TABLE_DIMENSIONS.length / 2 + 0.42, 0, 0];

/** Where the eaten tray is carried to before it disappears — just in front of the eater. */
export const EATEN_TRAY_TARGET: Vector3Tuple = [TABLE_DIMENSIONS.length / 2 + 0.1, TABLE_DIMENSIONS.height + 0.25, 0];

export const SEAT_POSITION: Record<Side, Vector3Tuple> = {
  near: [0.05, 0, 0.82],
  far: [0.05, 0, -0.82],
};

/** Y rotation that makes a seated kid face the table. */
export const SEAT_FACING: Record<Side, number> = { near: Math.PI, far: 0 };
export const EATER_FACING = -Math.PI / 2;

const sideSign = (side: Side) => (side === "near" ? 1 : -1);

/** Slot 0 is the front of the table — nearest the eater — matching `table[0]` on the wire. */
export function traySlotPosition(side: Side, slot: number): Vector3Tuple {
  return [
    FRONT_TRAY_X - slot * TRAY_PITCH,
    TABLE_DIMENSIONS.height + TRAY_DIMENSIONS.height / 2,
    TRAY_ROW_Z * sideSign(side),
  ];
}

/** A fresh tray slides in from off the foot of the table, behind the last slot. */
export function traySpawnPosition(side: Side, slotCount: number): Vector3Tuple {
  const [x, y, z] = traySlotPosition(side, slotCount);
  return [x - 0.2, y, z];
}

/** The upcoming-servings marker sits at the foot of the row, past where a fresh tray
 *  spawns, so it never sits under a tray sliding in. */
export function servingsMarkerPosition(side: Side, slotCount: number): Vector3Tuple {
  const [x, y, z] = traySpawnPosition(side, slotCount);
  return [x - 0.16, y + 0.1, z];
}

/** Far-side trays are turned around so each player sees their tray the same way up. */
export function trayFacing(side: Side): number {
  return side === "near" ? 0 : Math.PI;
}
