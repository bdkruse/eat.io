import { useGame } from "../state/GameProvider.js";

export function GameOverScreen() {
  const { state, playAgain, leaveToMenu } = useGame();
  const result = state.result;
  const room = state.room;
  if (!result || !room) return null;

  const opponentName = room.opponent.name;
  const headline =
    result.kind === "win"
      ? "You ate the most"
      : result.kind === "loss"
        ? `${opponentName} ate the most`
        : "Dead even";

  const rows = [
    { seat: room.you.seat, name: room.you.name, score: result.scores[room.you.seat] ?? 0 },
    { seat: room.opponent.seat, name: opponentName, score: result.scores[room.opponent.seat] ?? 0 },
  ];
  const best = Math.max(...rows.map((row) => row.score));

  return (
    <section className="screen over">
      <div className={`over__badge over__badge--${result.kind}`}>{headline}</div>

      <table className="over__card">
        <thead>
          <tr>
            <th>Player</th>
            <th>Eaten</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.seat}
              /* On a draw both rows tie for best, so both are outlined — correct. */
              className={row.score === best ? "over__row--winner" : undefined}
            >
              <td>{row.name}</td>
              <td>{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="over__actions">
        <button onClick={playAgain}>Play again</button>
        <button className="secondary" onClick={leaveToMenu}>
          Back to menu
        </button>
      </div>
    </section>
  );
}
