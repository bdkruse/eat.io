import { useScorePop } from "@eat.io/client/components/board/useScorePop.js";
import { useGame } from "@eat.io/client/state/GameProvider.js";
import { useRetained } from "../hooks/useRetained.js";

function ScoreCard({ side, name, score, ready }: { side: "you" | "opponent"; name: string; score: number; ready: boolean }) {
  const popping = useScorePop(score);
  return (
    <div className={`scorecard scorecard--${side}`}>
      <span className="scorecard__name">
        {name}
        {ready && <span className="scorecard__ready">READY</span>}
      </span>
      <span className={popping ? "scorecard__score scorecard__score--pop" : "scorecard__score"}>{score}</span>
      <span className="scorecard__label">eaten</span>
    </div>
  );
}

/**
 * Both scores, in the top corners. The middle of the top edge stays clear because that is
 * where the opponent's face lands in the top-down shot.
 */
export function GameHud() {
  const { state } = useGame();
  const room = useRetained(state.room);
  if (!room) return null;
  return (
    <div className="hud">
      <ScoreCard side="you" name={room.you.name} score={room.you.score} ready={room.you.submitted} />
      <ScoreCard side="opponent" name={room.opponent.name} score={room.opponent.score} ready={room.opponent.submitted} />
    </div>
  );
}

export function RoundChip() {
  const { state } = useGame();
  const room = useRetained(state.room);
  if (!room) return null;
  return (
    <span className="round-chip">
      Round <strong>{Math.min(room.roundIndex + 1, room.roundCount)}</strong> of {room.roundCount}
    </span>
  );
}
