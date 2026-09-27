import { Html } from "@react-three/drei";
import { servingsMarkerPosition, type Side } from "./tableLayout.js";

export interface ServingsMarkerProps {
  side: Side;
  /** How many trays are currently on this side's table — the marker sits past the foot. */
  slotCount: number;
  /** Upcoming bonuses, index 0 first — public, same list as `YouView`/`OpponentView` (§4.3). */
  extraServings: number[];
}

/**
 * The upcoming extra-servings bonuses, shown at the foot of a player's row of trays.
 * Hidden entirely once the list runs out, so it never lingers as an empty pill.
 */
export function ServingsMarker({ side, slotCount, extraServings }: ServingsMarkerProps) {
  if (extraServings.length === 0) return null;
  return (
    <Html position={servingsMarkerPosition(side, slotCount)} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
      <div className={`servings-marker servings-marker--${side}`}>
        {extraServings.map((bonus) => `+${bonus}`).join(", ")}
      </div>
    </Html>
  );
}
