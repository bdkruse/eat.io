import { createRandom } from "../../lib/seededRandom.js";

/**
 * The floor plan of the lunchroom, in meters. The game table sits at the origin, near the
 * front of the room; everything else is arranged around it.
 *
 *   back wall (z = -15):  serving line on the left, stage on the right
 *   left wall (x = -11):  doors, bulletin board, art wall, vending machine
 *   right wall (x = 11):  windows, trash and recycling
 */

export const ROOM = { minX: -11, maxX: 11, minZ: -15, maxZ: 8.5, height: 4.6 } as const;

export const DINING_TABLE = { length: 3.1, width: 0.95, height: 0.66 } as const;

export const DINING_TABLES: readonly [number, number][] = [
  [-6.5, 1.5],
  [6.5, 1.5],
  [-6.5, -3.5],
  [0, -4],
  [6.5, -3.5],
  [-6.5, -8],
  [0, -8.5],
  [6.5, -8],
];

export const SERVING_LINE = { fromX: -9.2, toX: -1.2, counterZ: -13.1, staffZ: -14.0, lineZ: -12.2 } as const;

export const STAGE = { fromX: 3, toX: 10.4, depth: 2.8, height: 0.85 } as const;

/** Aisles between the tables, used to route the walking crowd. */
const AISLE_X = { left: -9.6, innerLeft: -3.25, innerRight: 3.25, right: 9.6 } as const;
const AISLE_Z = { back: -10.9, middle: -6.0, front: -1.5, entry: 4.4 } as const;

/** Closed loops the walking kids follow, as floor points [x, z]. */
export const WALK_LOOPS: readonly (readonly [number, number])[][] = [
  // From the end of the serving line out to the left-hand tables.
  [
    [AISLE_X.left, AISLE_Z.back],
    [AISLE_X.innerLeft, AISLE_Z.back],
    [AISLE_X.innerLeft, AISLE_Z.middle],
    [AISLE_X.left, AISLE_Z.middle],
  ],
  // Around the middle column.
  [
    [AISLE_X.innerLeft, AISLE_Z.back],
    [AISLE_X.innerRight, AISLE_Z.back],
    [AISLE_X.innerRight, AISLE_Z.front],
    [AISLE_X.innerLeft, AISLE_Z.front],
  ],
  // Over to the windows and the bins.
  [
    [AISLE_X.innerRight, AISLE_Z.middle],
    [AISLE_X.right, AISLE_Z.middle],
    [AISLE_X.right, AISLE_Z.front],
    [AISLE_X.innerRight, AISLE_Z.front],
  ],
  // Front left, past the doors.
  [
    [AISLE_X.left, AISLE_Z.front],
    [AISLE_X.innerLeft, AISLE_Z.front],
    [AISLE_X.innerLeft, AISLE_Z.middle],
    [AISLE_X.left, AISLE_Z.middle],
  ],
  // The long way round, across the front of the room.
  [
    [AISLE_X.right, AISLE_Z.entry],
    [AISLE_X.right, AISLE_Z.back],
    [AISLE_X.left, AISLE_Z.back],
    [AISLE_X.left, AISLE_Z.entry],
  ],
];

// ---------- the crowd ----------
// Every crowd kid has its own index into `crowdAppearance`, from one shared space: the
// walkers, then the lunch line, then the seated diners. The lunch staff and the custodian
// are grown-ups with their own looks, so they are not in it.

export const WALKERS_PER_LOOP = 3;

/** The walker's crowd index. The first walker on each loop (the one low detail keeps)
 *  comes first, so the kids low detail draws still start the tone order. */
export function walkerCrowdIndex(loopIndex: number, indexOnLoop: number): number {
  return indexOnLoop * WALK_LOOPS.length + loopIndex;
}

/** Where the kids waiting in the lunch line stand, along `SERVING_LINE.lineZ`. */
export const LINE_SPOTS = [-8.4, -7.5, -6.5, -5.6, -4.6, -3.7, -2.6, -1.8] as const;

const FIRST_LINE_CROWD_INDEX = WALK_LOOPS.length * WALKERS_PER_LOOP;

export function lineCrowdIndex(spotIndex: number): number {
  return FIRST_LINE_CROWD_INDEX + spotIndex;
}

/** Seat positions along each side of a dining table, from its center. */
export const DINING_SEAT_XS = [-1.2, -0.6, 0, 0.6, 1.2] as const;

export interface DinerSeat {
  side: 1 | -1;
  x: number;
  crowdIndex: number;
}

/** The taken seats at each dining table, fixed so the crowd index of every diner is known
 *  here. Most seats are taken; a few gaps keep it from looking like a school photo. */
export const DINER_SEATS: readonly (readonly DinerSeat[])[] = (() => {
  let nextCrowdIndex = FIRST_LINE_CROWD_INDEX + LINE_SPOTS.length;
  return DINING_TABLES.map((_, tableIndex) => {
    const random = createRandom(2000 + tableIndex * 53);
    const seats: DinerSeat[] = [];
    for (const side of [1, -1] as const) {
      for (const x of DINING_SEAT_XS) {
        if (random.chance(0.72)) seats.push({ side, x, crowdIndex: nextCrowdIndex++ });
      }
    }
    return seats;
  });
})();

/** How many crowd kids the room holds at full detail. */
export const CROWD_SIZE = FIRST_LINE_CROWD_INDEX + LINE_SPOTS.length + DINER_SEATS.flat().length;
