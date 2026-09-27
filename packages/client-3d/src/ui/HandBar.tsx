import { useEffect } from "react";
import type { CardView } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectAwaitingYou, selectBoardFrozen } from "../state/gameState.js";
import { useLocalState } from "../state/LocalState.js";
import { RoundChip } from "./GameHud.js";
import { useRetained } from "../hooks/useRetained.js";
import { cardGlyph } from "./cardGlyph.js";

function LunchCard({ card, index, selected, disabled, onClick }: { card: CardView; index: number; selected: boolean; disabled: boolean; onClick: () => void }) {
  // Everything shown comes from server data — no switch over card ids.
  return (
    <button
      className={`lunch-card lunch-card--${card.action}${selected ? " lunch-card--selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={card.name}
    >
      <span className="lunch-card__key">{index + 1}</span>
      <span className="lunch-card__glyph">{cardGlyph(card)}</span>
      <span className="lunch-card__name">{card.name}</span>
      <span className="lunch-card__targets">
        {card.targets === 0 ? (
          "no trays"
        ) : (
          <>
            {Array.from({ length: card.targets }, (_, pip) => (
              <span key={pip} className="lunch-card__pip" />
            ))}
            {card.targets} {card.targets === 1 ? "tray" : "trays"}
          </>
        )}
      </span>
    </button>
  );
}

/** Status, End turn, and your hand. Keys 1–9 pick a card, Enter ends the turn, Esc clears. */
export function HandBar() {
  const { state } = useGame();
  const { selection, targetCount, ready, chooseCard, clearSelection, endTurn } = useLocalState();
  const room = useRetained(state.room);
  const awaitingYou = selectAwaitingYou(state);
  const frozen = selectBoardFrozen(state);
  const hand = room?.you.hand ?? [];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (!awaitingYou || frozen) return;
      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= hand.length) chooseCard(hand[number - 1]!.instanceId);
      else if (event.key === "Enter") endTurn();
      else if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awaitingYou, frozen, hand, chooseCard, endTurn, clearSelection]);

  if (!room) return null;

  const status = frozen
    ? "Reconnecting — hold on"
    : !awaitingYou
      ? `Waiting for ${room.opponent.name}`
      : !selection.cardInstanceId
        ? "Your move — pick a card"
        : !ready
          ? `Now tap ${targetCount} ${targetCount === 1 ? "tray" : "trays"} on your side`
          : "Ready — end your turn";

  return (
    <div className="handbar">
      <div className="handbar__turn">
        <RoundChip />
        <span className={ready ? "status-pill status-pill--ready" : "status-pill"}>{status}</span>
        <button className="button button--primary" disabled={!ready || !awaitingYou || frozen} onClick={endTurn}>
          End turn
        </button>
      </div>
      <div className="hand">
        {hand.map((card, index) => (
          <LunchCard
            key={card.instanceId}
            card={card}
            index={index}
            selected={selection.cardInstanceId === card.instanceId}
            disabled={!awaitingYou || frozen}
            onClick={() => chooseCard(card.instanceId)}
          />
        ))}
      </div>
    </div>
  );
}
