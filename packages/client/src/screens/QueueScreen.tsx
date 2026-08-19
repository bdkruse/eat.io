import { useGame } from "../state/GameProvider.js";

export function QueueScreen() {
  const { state, cancelQueue } = useGame();

  return (
    <section className="screen queue">
      <div className="queue__bob" aria-hidden="true">
        <span style={{ fontSize: 64 }}>&#129498;</span>
      </div>
      <h2 className="queue__title">
        Finding you a lunch buddy
        <span className="queue__dots">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </h2>
      <p>You are queued as {state.name}</p>
      {state.privateCode && <p>Private room code: {state.privateCode}</p>}
      <button onClick={cancelQueue}>Cancel</button>
    </section>
  );
}
