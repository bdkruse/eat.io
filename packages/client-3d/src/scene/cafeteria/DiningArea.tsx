import { useMemo } from "react";
import { BoxGeometry, CylinderGeometry, SphereGeometry } from "three";
import type { Appearance } from "../../appearance/appearance.js";
import { crowdAppearance } from "../../appearance/crowdAppearance.js";
import { createRandom } from "../../lib/seededRandom.js";
import { Kid } from "../characters/Kid.js";
import type { Animation } from "../characters/poses.js";
import { sharedGeometry, toon } from "../materials.js";
import { keepsKid, type DetailBudget } from "../detail.js";
import { DINER_SEATS, DINING_TABLE, DINING_TABLES } from "./layout.js";
import { LunchTable } from "./LunchTable.js";

const BENCH_OFFSET = 0.8;

const trayGeometry = () => sharedGeometry("smallTray", () => new BoxGeometry(0.4, 0.022, 0.3));
const cartonGeometry = () => sharedGeometry("carton", () => new BoxGeometry(0.06, 0.1, 0.06));
const roofGeometry = () => sharedGeometry("cartonRoof", () => new CylinderGeometry(0, 0.045, 0.04, 4, 1));
const lumpGeometry = () => sharedGeometry("mealLump", () => new SphereGeometry(0.04, 8, 6));
const appleGeometry = () => sharedGeometry("apple", () => new SphereGeometry(0.04, 10, 8));

const TRAY_COLORS = ["#e9dfc9", "#d6e4ea", "#f0d9cf"];
const MEAL_COLORS = ["#e2a63d", "#c9543f", "#e8c04d", "#5f9e4a", "#e9d8a6", "#e2703a"];

interface SeatedKid {
  key: string;
  appearance: Appearance;
  animation: Animation;
  phase: number;
  x: number;
  side: 1 | -1;
  mealColors: [string, string, string];
  trayColor: string;
  apple: boolean;
}

/** Weighted so most kids are eating or talking — a lunchroom, not a waiting room. */
function pickAnimation(roll: number): Animation {
  if (roll < 0.38) return "eat";
  if (roll < 0.62) return "chat";
  if (roll < 0.86) return "listen";
  if (roll < 0.94) return "idle";
  return "wave";
}

function seatKids(tableIndex: number): SeatedKid[] {
  const random = createRandom(1000 + tableIndex * 97);
  return DINER_SEATS[tableIndex]!.map((seat) => ({
    key: `${seat.side}:${seat.x}`,
    appearance: crowdAppearance(seat.crowdIndex),
    animation: pickAnimation(random.next()),
    phase: random.next(),
    x: seat.x + random.range(-0.06, 0.06),
    side: seat.side,
    mealColors: [random.pick(MEAL_COLORS), random.pick(MEAL_COLORS), random.pick(MEAL_COLORS)],
    trayColor: random.pick(TRAY_COLORS),
    apple: random.chance(0.3),
  }));
}

export function DiningArea({ budget }: { budget: DetailBudget }) {
  // Generated once at full size, then thinned, so low detail shows a subset of the same kids.
  const allTables = useMemo(() => DINING_TABLES.map((_, index) => seatKids(index)), []);
  const tables = allTables.map((kids) => kids.filter((_, index) => keepsKid(index, budget.seatedKeepEvery)));
  return (
    <group>
      {DINING_TABLES.map(([x, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <LunchTable length={DINING_TABLE.length} width={DINING_TABLE.width} height={DINING_TABLE.height} benchOffset={BENCH_OFFSET} />
          {tables[index]!.map((kid) => (
            <group key={kid.key}>
              <Kid
                appearance={kid.appearance}
                pose="sit"
                animation={kid.animation}
                phase={kid.phase}
                position={[kid.x, 0, kid.side * BENCH_OFFSET]}
                rotation={kid.side === 1 ? Math.PI : 0}
                detail="low"
              />
              <Meal kid={kid} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** A tray of food and a milk carton in front of each seated kid. */
function Meal({ kid }: { kid: SeatedKid }) {
  const tableTop = DINING_TABLE.height;
  const z = kid.side * 0.24;
  return (
    <group position={[kid.x, tableTop, z]} rotation={[0, kid.side === 1 ? Math.PI : 0, 0]}>
      <mesh geometry={trayGeometry()} material={toon(kid.trayColor)} position={[0, 0.011, 0]} />
      <mesh geometry={lumpGeometry()} material={toon(kid.mealColors[0])} position={[-0.08, 0.03, 0]} scale={[1.6, 0.6, 1.4]} />
      <mesh geometry={lumpGeometry()} material={toon(kid.mealColors[1])} position={[0.1, 0.03, -0.07]} scale={[0.9, 0.6, 0.9]} />
      <mesh geometry={lumpGeometry()} material={toon(kid.mealColors[2])} position={[0.1, 0.03, 0.07]} scale={[0.9, 0.6, 0.9]} />
      <group position={[0.26, 0, 0.05]}>
        <mesh geometry={cartonGeometry()} material={toon("#fbfaf6")} position={[0, 0.05, 0]} />
        <mesh geometry={roofGeometry()} material={toon("#4a7fa5")} position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]} />
      </group>
      {kid.apple && <mesh geometry={appleGeometry()} material={toon("#c9543f")} position={[-0.28, 0.04, -0.05]} />}
    </group>
  );
}
