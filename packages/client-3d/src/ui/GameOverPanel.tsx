import { useGame } from "@eat.io/client/state/GameProvider.js";

export function GameOverPanel() {
  const { state, playAgain, leaveToMenu } = useGame();
  const result = state.result;
  const room = state.room;
  if (!result || !room) return null;

  const headline = result.kind === "win" ? "You ate the most!" : result.kind === "loss" ? `${room.opponent.name} ate the most` : "Dead even — a draw";
  const rows = [
    { seat: room.you.seat, name: room.you.name, score: result.scores[room.you.seat] ?? 0, side: "you" },
    { seat: room.opponent.seat, name: room.opponent.name, score: result.scores[room.opponent.seat] ?? 0, side: "opponent" },
  ];
  const best = Math.max(...rows.map((row) => row.score));

  return (
    <section className="panel panel--over">
      <div className={`result-badge result-badge--${result.kind}`}>{headline}</div>
      <div className="result-rows">
        {rows.map((row) => (
          // On a draw both rows tie for best, so both are marked — correct.
          <div key={row.seat} className={`result-row result-row--${row.side}${row.score === best ? " result-row--best" : ""}`}>
            <span>{row.name}</span>
            <strong>{row.score}</strong>
          </div>
        ))}
      </div>
      <div className="panel__actions panel__actions--row">
        <button className="button button--primary" onClick={playAgain}>
          Play again
        </button>
        <button className="button button--secondary" onClick={leaveToMenu}>
          Back to menu
        </button>
      </div>
    </section>
  );
}
