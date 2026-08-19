import { Child } from "../components/board/Child.js";
import { useGame } from "../state/GameProvider.js";

export function QueueScreen() {
  const { state, cancelQueue } = useGame();

  return (
    <section className="screen queue">
      <div className="queue__bob" aria-hidden="true">
        <Child accent="you" />
      </div>
      {state.privateCode ? (
        <>
          <h2 className="queue__title">Your room is ready</h2>
          <p>Give this code to whoever you want to eat with.</p>
          <div className="queue__code">{state.privateCode}</div>
          <p>
            Waiting for them to join
            <span className="queue__dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
        </>
      ) : (
        <>
          <h2 className="queue__title">
            Finding you a lunch buddy
            <span className="queue__dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </h2>
          <p>You are queued as {state.name}</p>
        </>
      )}
      <button onClick={cancelQueue}>Cancel</button>
    </section>
  );
}
