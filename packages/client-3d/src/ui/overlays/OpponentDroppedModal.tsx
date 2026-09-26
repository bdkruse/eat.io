import { useEffect, useState } from "react";
import { useGame } from "../../state/GameProvider.js";

export function OpponentDroppedModal() {
  const { state, leaveRoom } = useGame();
  const dropped = state.opponentDropped;
  const ended = state.room?.phase === "abandoned";
  const graceEndsAt = dropped?.graceEndsAt ?? null;
  const [remaining, setRemaining] = useState(1);

  // A clock belongs here, in a view, never in the reducer.
  useEffect(() => {
    if (graceEndsAt === null) return;
    const started = Date.now();
    const span = Math.max(1, graceEndsAt - started);
    const tick = setInterval(() => {
      setRemaining(Math.max(0, (graceEndsAt - Date.now()) / span));
    }, 200);
    return () => clearInterval(tick);
  }, [graceEndsAt]);

  if (!dropped && !ended) return null;
  const opponentName = state.room?.opponent.name ?? "Your opponent";

  return (
    <div className="modal-scrim">
      <div className="modal" role="dialog" aria-modal="true">
        {ended ? (
          <p>
            <strong>{opponentName} has left the lunchroom</strong>
            <br />
            No result is recorded.
          </p>
        ) : (
          <>
            <p>
              <strong>{opponentName} dropped out</strong> — holding their seat for a moment.
              <br />
              The table is paused, not ended.
            </p>
            <div className="modal__bar">
              <span style={{ width: `${Math.round(remaining * 100)}%` }} />
            </div>
          </>
        )}
        <button onClick={leaveRoom}>Leave game</button>
      </div>
    </div>
  );
}
