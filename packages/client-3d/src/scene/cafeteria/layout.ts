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
