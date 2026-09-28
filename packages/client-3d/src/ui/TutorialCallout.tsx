import { useGame } from "../state/GameProvider.js";
import { selectBoardFrozen, selectPracticeRoom } from "../state/gameState.js";
import { useLocalState } from "../state/LocalState.js";

/**
 * The practice game's guide: the current prompt with a Next button where the prompt asks
 * for one, and a Skip button for the whole game (spec §5.2). Skip leaves the room; the
 * server's `roomLeft` then brings the menu back.
 */
export function TutorialCallout() {
  const { state, leaveRoom } = useGame();
  const { tutorialPrompt, tutorialNext } = useLocalState();
  if (!selectPracticeRoom(state)) return null;
  const frozen = selectBoardFrozen(state);

  return (
    // The anchor rides along as a class, so a portrait layout can keep the callout clear of
    // whatever the prompt points at.
    <aside className={`tutorial-callout tutorial-callout--${tutorialPrompt?.anchor ?? "none"}`} aria-live="polite">
      {tutorialPrompt && (
        <div className="tutorial-callout__bubble">
          <p className="tutorial-callout__text">{tutorialPrompt.text}</p>
          {tutorialPrompt.advance === "next" && (
            <button className="button button--primary" disabled={frozen} onClick={tutorialNext}>
              Next
            </button>
          )}
        </div>
      )}
      <button className="button button--ghost tutorial-callout__skip" disabled={frozen} onClick={leaveRoom}>
        Skip
      </button>
    </aside>
  );
}
