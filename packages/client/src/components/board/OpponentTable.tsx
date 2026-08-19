import type { RoomStateMessage } from "@eat.io/protocol";
import { Child } from "./Child.js";
import { Tray } from "./Tray.js";

type Opponent = RoomStateMessage["opponent"];

/** Read-only by construction: no click handlers, no selection, no hand contents. */
export function OpponentTable({ opponent, biting }: { opponent: Opponent; biting: boolean }) {
  return (
    <div>
      <div className="seat-line">
        <span className="seat-chip seat-chip--opponent" />
        <strong>{opponent.name}</strong>
        <span>{opponent.handCount} cards in hand</span>
        {opponent.submitted && <span className="seat-line__ready">READY</span>}
      </div>
      <div className="table-strip">
        <div className="table-strip__trays">
          {opponent.table.map((tray) => (
            <Tray key={tray.id} tray={tray} variant="opponent" />
          ))}
        </div>
        <div className="table-strip__edge" />
        <div className="table-strip__end">
          <Child accent="opponent" size="small" biting={biting} />
          <div className="table-strip__score">{opponent.score}</div>
        </div>
      </div>
    </div>
  );
}
