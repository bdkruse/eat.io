import type { RoomStateMessage } from "@eat.io/protocol";
import type { Selection } from "../../state/selection.js";
import { Child } from "./Child.js";
import { Tray } from "./Tray.js";

type You = RoomStateMessage["you"];

interface YourTableProps {
  you: You;
  selection: Selection;
  /** How many targets the selected card takes; order badges show only when > 1. */
  targetCount: number;
  onTrayClick: (trayId: string) => void;
  biting: boolean;
}

export function YourTable({ you, selection, targetCount, onTrayClick, biting }: YourTableProps) {
  return (
    <div>
      <div className="seat-line">
        <span className="seat-chip seat-chip--you" />
        <strong>{you.name}</strong>
        <span>your table</span>
        {you.submitted && <span className="seat-line__ready">READY</span>}
      </div>
      <div className="table-strip">
        <div className="table-strip__trays">
          {you.table.map((tray) => {
            const position = selection.targetTrayIds.indexOf(tray.id);
            return (
              <Tray
                key={tray.id}
                tray={tray}
                variant="you"
                selected={position >= 0}
                order={position >= 0 && targetCount > 1 ? position + 1 : null}
                onClick={() => onTrayClick(tray.id)}
              />
            );
          })}
        </div>
        <div className="table-strip__edge" />
        <div className="table-strip__end">
          <Child accent="you" biting={biting} />
          <div className="table-strip__score">{you.score}</div>
          <div className="table-strip__score-label">EATEN</div>
        </div>
      </div>
    </div>
  );
}
