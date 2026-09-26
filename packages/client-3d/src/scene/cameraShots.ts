import type { Screen } from "../state/gameState.js";
import type { Vector3Tuple } from "./game/tableLayout.js";

export type ShotName = "menu" | "customize" | "queue" | "game" | "gamePortrait" | "gameOver";

export interface CameraShot {
  position: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
  /**
   * The narrowest horizontal span, in meters at the target, that must stay in frame. On a
   * narrow window the rig backs the camera away along its view line until it fits.
   */
  minimumWidth: number;
  /** How far the camera sways around its position, for shots that should feel alive. */
  drift: number;
  /** Which world direction is "up" on screen. Defaults to +Y. */
  up?: Vector3Tuple;
}

/** Where your kid stands to be looked at on the customize screen. */
export const CUSTOMIZE_SPOT: Vector3Tuple = [-2.5, 0, 1.9];

export const CAMERA_SHOTS: Record<ShotName, CameraShot> = {
  menu: { position: [6.2, 3.3, 8.2], target: [-1.2, 1.0, -4.5], fov: 50, minimumWidth: 7, drift: 0.6 },
  customize: {
    position: [CUSTOMIZE_SPOT[0] + 0.25, 1.05, CUSTOMIZE_SPOT[2] + 2.3],
    target: [CUSTOMIZE_SPOT[0] - 0.55, 0.72, CUSTOMIZE_SPOT[2]],
    fov: 40,
    minimumWidth: 1.4,
    drift: 0.05,
  },
  queue: { position: [3.4, 2.3, 4.4], target: [0, 0.75, 0], fov: 45, minimumWidth: 4, drift: 0.25 },
  // Nearly straight down, tilted just enough from your side that the opponent's face shows.
  // The target sits toward you so the table clears the hand bar at the bottom of the screen.
  game: { position: [0.3, 4.3, 1.05], target: [0.3, 0.66, 0.24], fov: 46, minimumWidth: 4.0, drift: 0 },
  // On a tall, narrow screen the table is turned to run up the screen, eater at the top:
  // straight down, with +X as screen-up. Your side lands on the right.
  // The camera cannot rise above the ceiling, so a wide lens does the fitting instead.
  gamePortrait: { position: [0.2, 4.3, 0], target: [0.2, 0.66, 0], fov: 74, minimumWidth: 0, drift: 0, up: [1, 0, 0] },
  // Low, from the foot of the table, so both kids and the eater are seen reacting. The
  // target is pushed left of the table so it sits to the right of the result panel.
  gameOver: { position: [-3.1, 1.75, 2.4], target: [-0.9, 0.85, 0.35], fov: 45, minimumWidth: 3.2, drift: 0.1 },
};

/**
 * A match outranks showing your kid — whether that is the customize screen or the
 * profile panel (the caller ORs the two together, §11) — if one is found mid-edit or
 * mid-profile, go to the table.
 */
export function selectShot(screen: Screen, showingKid: boolean, portrait = false): ShotName {
  switch (screen) {
    case "game":
      return portrait ? "gamePortrait" : "game";
    case "gameOver":
      return "gameOver";
    case "queue":
      return showingKid ? "customize" : "queue";
    case "connect":
      return showingKid ? "customize" : "menu";
  }
}
