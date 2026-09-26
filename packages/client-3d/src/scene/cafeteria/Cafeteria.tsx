import { Crowd } from "./Crowd.js";
import { Decor } from "./Decor.js";
import { DiningArea } from "./DiningArea.js";
import { Room } from "./Room.js";
import { ServingLine } from "./ServingLine.js";

/** The whole lunchroom around the game table: always running, behind every screen. */
export function Cafeteria() {
  return (
    <group>
      <Room />
      <ServingLine />
      <DiningArea />
      <Crowd />
      <Decor />
    </group>
  );
}
