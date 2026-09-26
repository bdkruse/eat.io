import { useEffect, useRef } from "react";
import type { DirectionalLight } from "three";
import { ROOM } from "./cafeteria/layout.js";

/**
 * Daylight from the windows on the right wall plus a warm fill from the ceiling. One
 * shadow-casting light, its shadow camera sized to the room so the shadows stay crisp.
 */
export function Lighting() {
  const sun = useRef<DirectionalLight>(null);

  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    const shadowCamera = light.shadow.camera;
    shadowCamera.left = -15;
    shadowCamera.right = 15;
    shadowCamera.top = 15;
    shadowCamera.bottom = -15;
    shadowCamera.near = 1;
    shadowCamera.far = 45;
    shadowCamera.updateProjectionMatrix();
    light.target.position.set(-1, 0, -3);
    light.target.updateMatrixWorld();
  }, []);

  return (
    <>
      <hemisphereLight args={["#fff8ec", "#9fb3a3", 1.35]} />
      <ambientLight intensity={0.25} color="#fff1dc" />
      <directionalLight
        ref={sun}
        position={[ROOM.maxX + 6, 14, 4]}
        intensity={2.1}
        color="#fff3dd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}
