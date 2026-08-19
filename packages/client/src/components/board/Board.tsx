import type { RoomStateMessage } from "@eat.io/protocol";
import type { Selection } from "../../state/selection.js";
import { OpponentTable } from "./OpponentTable.js";
import { YourTable } from "./YourTable.js";

interface BoardProps {
  room: RoomStateMessage;
  selection: Selection;
  targetCount: number;
  onTrayClick: (trayId: string) => void;
  biting: boolean;
  frozen: boolean;
}

export function Board({ room, selection, targetCount, onTrayClick, biting, frozen }: BoardProps) {
  return (
    <div className={frozen ? "board board--frozen" : "board"}>
      <div className="board__inner">
        <OpponentTable opponent={room.opponent} biting={biting} />
        <hr className="board__divider" />
        <YourTable
          you={room.you}
          selection={selection}
          targetCount={targetCount}
          onTrayClick={onTrayClick}
          biting={biting}
        />
      </div>
    </div>
  );
}
