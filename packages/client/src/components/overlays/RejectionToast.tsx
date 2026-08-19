import { useEffect } from "react";
import { useGame } from "../../state/GameProvider.js";

const HOLD_MS = 3400;

export function RejectionToast() {
  const { state, dismissRejection } = useGame();
  const rejection = state.rejection;
  const seq = rejection?.seq ?? null;

  // Keyed on seq, so a repeat of the same code restarts the timer rather than being lost.
  useEffect(() => {
    if (seq === null) return;
    const timer = setTimeout(dismissRejection, HOLD_MS);
    return () => clearTimeout(timer);
  }, [seq, dismissRejection]);

  if (!rejection) return null;

  return (
    <div className="toast" role="alert">
      <span className="toast__disc">!</span>
      <span>
        <span className="toast__heading">Move rejected</span>
        <br />
        {rejection.message}
      </span>
    </div>
  );
}
