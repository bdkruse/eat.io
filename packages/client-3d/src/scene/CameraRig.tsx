import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { ROOM } from "./cafeteria/layout.js";
import { CAMERA_SHOTS, type ShotName } from "./cameraShots.js";

const CEILING_CLEARANCE = ROOM.height - 0.25;
const DEFAULT_UP: [number, number, number] = [0, 1, 0];

/** How quickly the camera settles on a new shot; about a second and a half end to end. */
const EASE = 1.9;

/**
 * Eases the camera between named shots. Never snaps: the fly from the menu down to the
 * table is the same easing as every other move. On a narrow window each shot backs away
 * along its own line of sight until its minimum width fits.
 */
export function CameraRig({ shot }: { shot: ShotName }) {
  const camera = useThree((three) => three.camera);
  const current = useRef<{ position: Vector3; target: Vector3; up: Vector3; fov: number } | null>(null);
  const goal = useRef({ position: new Vector3(), target: new Vector3(), up: new Vector3(), direction: new Vector3() });

  useFrame(({ clock, size }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const spec = CAMERA_SHOTS[shot];
    const { position, target, up, direction } = goal.current;
    target.set(...spec.target);
    position.set(...spec.position);
    up.set(...(spec.up ?? DEFAULT_UP));

    // Back away until the shot's minimum width fits the window's aspect.
    const aspect = size.width / Math.max(1, size.height);
    const horizontalHalfFov = Math.atan(Math.tan(MathUtils.degToRad(spec.fov / 2)) * aspect);
    direction.subVectors(position, target);
    const distance = direction.length();
    const needed = spec.minimumWidth / 2 / Math.tan(horizontalHalfFov);
    if (needed > distance) position.copy(target).addScaledVector(direction.normalize(), needed);
    // Never back out through the ceiling; the bunting and lights would fill the view.
    position.y = Math.min(position.y, CEILING_CLEARANCE);

    if (spec.drift > 0) {
      const time = clock.elapsedTime;
      position.x += Math.sin(time * 0.11) * spec.drift;
      position.y += Math.sin(time * 0.17) * spec.drift * 0.25;
      position.z += Math.cos(time * 0.09) * spec.drift * 0.6;
    }

    if (!current.current) {
      current.current = { position: position.clone(), target: target.clone(), up: up.clone(), fov: spec.fov };
    }
    const state = current.current;
    const easing = 1 - Math.exp(-EASE * delta);
    state.position.lerp(position, easing);
    state.target.lerp(target, easing);
    // Rolling the up vector turns the table smoothly when a shot rotates the view.
    state.up.lerp(up, easing).normalize();
    state.fov = MathUtils.lerp(state.fov, spec.fov, easing);

    camera.position.copy(state.position);
    camera.up.copy(state.up);
    camera.lookAt(state.target);
    if (Math.abs(camera.fov - state.fov) > 0.01) {
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
