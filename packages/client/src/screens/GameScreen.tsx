import { useEffect, useState } from "react";
import { Board } from "../components/board/Board.js";
import { Hand } from "../components/hand/Hand.js";
import { StatusPill } from "../components/hand/StatusPill.js";
import { useGame } from "../state/GameProvider.js";
import { selectAwaitingYou, selectBoardFrozen, selectYourCard } from "../state/gameState.js";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
  type Selection,
} from "../state/selection.js";

export function GameScreen() {
  const { state, submitTurn, noteLocalRejection } = useGame();
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const room = state.room;
  const roundIndex = room?.roundIndex;

  // A resolved round replaces the hand, so last round's choice must not linger.
  useEffect(() => {
    setSelection(emptySelection);
  }, [roundIndex]);

  if (!room) return null;

  const card = selectYourCard(state, selection.cardId);
  const targetCount = card?.targets ?? 0;
  const awaitingYou = selectAwaitingYou(state);
  const ready = isSubmittable(selection, targetCount);

  const status = !awaitingYou
    ? "Waiting for your opponent"
    : !selection.cardId
      ? "Your move — pick a card"
      : !ready
        ? `Now tap ${targetCount} ${targetCount === 1 ? "tray" : "trays"}`
        : "Ready — end your turn";

  return (
    <section className="screen">
      <Board
        room={room}
        selection={selection}
        targetCount={targetCount}
        biting={false}
        frozen={selectBoardFrozen(state)}
        onTrayClick={(trayId) => {
          const result = toggleTray(selection, trayId, targetCount);
          if (result.needsCardFirst) {
            noteLocalRejection(
              "Pick a card first — the card decides how many trays you may target.",
            );
            return;
          }
          setSelection(result.selection);
        }}
      />

      <div className="turnbar">
        <StatusPill text={status} ready={ready} />
        <button
          disabled={!ready || !awaitingYou}
          onClick={() => {
            if (!selection.cardId) return;
            submitTurn(selection.cardId, selection.targetTrayIds);
            setSelection(emptySelection);
          }}
        >
          End turn
        </button>
      </div>

      <Hand
        cards={room.you.hand}
        selectedId={selection.cardId}
        onSelect={(cardId) => setSelection(selectCard(selection, cardId))}
      />
    </section>
  );
}
