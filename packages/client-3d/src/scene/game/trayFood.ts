import { layoutTray, type Well } from "@eat.io/client/food/foodLayout.js";
import { hashString } from "../../lib/seededRandom.js";

/**
 * 3D food on a tray. Quantity IS the value — one item per point — placed with the classic
 * client's `layoutTray`, so placement depends only on (trayId, well, slot) and a tray gains
 * or loses food without the rest moving.
 *
 * Wells are in millimeters, in the tray's local frame: x along the table, z across it.
 */
interface PlacedWell extends Well {
  /** Well center in the tray's local frame, meters. */
  centerX: number;
  centerZ: number;
  /** Which kinds of food this well can be filled with. */
  menu: readonly FoodKind[];
}

export const FOOD_KINDS = ["nugget", "tot", "meatball", "carrot", "broccoli", "grape", "corn"] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

const MAINS: readonly FoodKind[] = ["nugget", "tot", "meatball"];
const SIDES: readonly FoodKind[] = ["carrot", "broccoli", "grape", "corn"];

/** One large main well and two small side wells — the same 12 + 2 + 2 as the classic tray. */
export const TRAY_WELLS: readonly PlacedWell[] = [
  { width: 240, height: 270, columns: 3, rows: 4, centerX: -0.075, centerZ: 0, menu: MAINS },
  { width: 140, height: 120, columns: 2, rows: 1, centerX: 0.14, centerZ: -0.075, menu: SIDES },
  { width: 140, height: 120, columns: 2, rows: 1, centerX: 0.14, centerZ: 0.075, menu: SIDES },
];

export const TRAY_CAPACITY = TRAY_WELLS.reduce((total, well) => total + well.columns * well.rows, 0);

export interface FoodItem {
  key: string;
  kind: FoodKind;
  /** Local tray position, meters. */
  x: number;
  z: number;
  /** Roughly the item's footprint, meters. */
  size: number;
  /** A small, stable yaw so rows of food do not look stamped. */
  yaw: number;
}

export interface TrayFood {
  items: FoodItem[];
  /** Food the tray cannot physically hold, shown as a `+N` chip. */
  overflow: number;
}

const MILLIMETERS = 0.001;

/** One kind per well, chosen by tray, so each tray reads as a real lunch. */
function wellKind(trayId: string, wellIndex: number, menu: readonly FoodKind[]): FoodKind {
  return menu[hashString(`${trayId}:kind:${wellIndex}`) % menu.length]!;
}

export function trayFood(trayId: string, value: number): TrayFood {
  const laid = layoutTray(trayId, value, TRAY_WELLS);
  const items: FoodItem[] = [];

  laid.perWell.forEach((shapes, wellIndex) => {
    const well = TRAY_WELLS[wellIndex]!;
    const kind = wellKind(trayId, wellIndex, well.menu);
    for (const shape of shapes) {
      // Shapes are top-left anchored inside the well; convert to a centered local point.
      const centerX = (shape.x + shape.size / 2 - well.width / 2) * MILLIMETERS;
      const centerZ = (shape.y + shape.size / 2 - well.height / 2) * MILLIMETERS;
      items.push({
        key: shape.key,
        kind,
        x: well.centerX + centerX,
        z: well.centerZ + centerZ,
        size: shape.size * MILLIMETERS,
        yaw: (hashString(shape.key) % 628) / 100,
      });
    }
  });

  return { items, overflow: laid.overflow };
}
