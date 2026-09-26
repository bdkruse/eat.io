import { useGame } from "../state/GameProvider.js";
import { useLocalState } from "../state/LocalState.js";

function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export function QueuePanel() {
  const { state, cancelQueue } = useGame();
  const { setCustomizing } = useLocalState();

  return (
    <section className="panel panel--queue">
      {state.privateCode ? (
        <>
          <h2 className="panel__title">Your room is ready</h2>
          <p>Give this code to whoever you want to eat with.</p>
          <div className="room-code">{state.privateCode}</div>
          <p>
            Waiting for them to join
            <Dots />
          </p>
        </>
      ) : (
        <>
          <h2 className="panel__title">
            Finding you a lunch buddy
            <Dots />
          </h2>
          <p>You are queued as {state.name}.</p>
        </>
      )}
      <div className="panel__actions panel__actions--row">
        <button className="button button--secondary" onClick={() => setCustomizing(true)}>
          Customize while you wait
        </button>
        <button className="button button--primary" onClick={cancelQueue}>
          Cancel
        </button>
      </div>
    </section>
  );
}
