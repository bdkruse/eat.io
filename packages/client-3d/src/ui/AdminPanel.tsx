import { useEffect, useRef, useState } from "react";
import { SETTINGS_LIMITS, settingsProblem, type GameSettings } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectAdminMessages } from "../state/gameState.js";
import { useLocalState } from "../state/LocalState.js";
import { replySinceMount } from "./replySinceMount.js";

/** Docked left, like the other panels. Only a profile with `settings.edit` ever sees this
 *  (the top bar hides the Admin button otherwise), but it guards on that too (§9). */
export function AdminPanel() {
  const { state, requestSettings, saveSettings } = useGame();
  const { setAdminOpen } = useLocalState();
  const account = state.account;
  // Whatever the last visit left in AppState. It is never used: the fields seed only from
  // the reply to this mount's own request (fix round 1).
  const [settingsAtMount] = useState(state.adminSettings);

  useEffect(() => {
    requestSettings();
    // Runs once, when the panel mounts (i.e. each time it opens) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typed as text, not numbers: a value outside its range must still show in the field
  // rather than being silently clamped away — Save disables instead (§9).
  const [roundCountText, setRoundCountText] = useState("");
  const [turnSecondsText, setTurnSecondsText] = useState("");
  const [handSizeText, setHandSizeText] = useState("");

  const adminSettings = replySinceMount(state.adminSettings, settingsAtMount);
  const { notice: adminNotice, error: adminError } = selectAdminMessages(state, "settings");
  // Seeds the fields once, the first time this mount sees a fresh reply — never again, so
  // it cannot stomp on a value the Admin is mid-typing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (adminSettings && !seededRef.current) {
      seededRef.current = true;
      setRoundCountText(String(adminSettings.settings.roundCount));
      setTurnSecondsText(String(adminSettings.settings.turnSeconds));
      setHandSizeText(String(adminSettings.settings.handSize));
    }
  }, [adminSettings]);

  if (!account || !account.permissions.includes("settings.edit")) return null;

  // Before the first `settings` message answers `requestSettings`, the fields are still
  // empty — do not flash a range complaint about a value nobody has typed yet.
  const loaded = adminSettings !== null;
  const candidateSettings: GameSettings = {
    roundCount: Number(roundCountText),
    turnSeconds: Number(turnSecondsText),
    handSize: Number(handSizeText),
  };
  const problem = loaded ? settingsProblem(candidateSettings) : null;
  const canSave = loaded && problem === null && !state.savingSettings;

  return (
    <section className="panel panel--admin">
      <h2 className="panel__title">Admin</h2>

      <label className="field">
        <span className="field__label">Round count</span>
        <input
          className="field__input"
          type="number"
          value={roundCountText}
          onChange={(event) => setRoundCountText(event.target.value)}
        />
      </label>
      <p className="field__hint">
        {SETTINGS_LIMITS.roundCount.min}–{SETTINGS_LIMITS.roundCount.max} rounds
      </p>

      <label className="field">
        <span className="field__label">Turn clock</span>
        <input
          className="field__input"
          type="number"
          value={turnSecondsText}
          onChange={(event) => setTurnSecondsText(event.target.value)}
        />
      </label>
      <p className="field__hint">
        {SETTINGS_LIMITS.turnSeconds.min}–{SETTINGS_LIMITS.turnSeconds.max} seconds
      </p>

      <label className="field">
        <span className="field__label">Hand size</span>
        <input
          className="field__input"
          type="number"
          value={handSizeText}
          onChange={(event) => setHandSizeText(event.target.value)}
        />
      </label>
      <p className="field__hint">
        {SETTINGS_LIMITS.handSize.min}–{SETTINGS_LIMITS.handSize.max} cards
      </p>

      {!loaded && <p className="panel__note">Loading…</p>}
      {problem && <p className="panel__error">{problem}</p>}
      {adminNotice && <p className="panel__note">{adminNotice.text}</p>}
      {adminError && <p className="panel__error">{adminError.message}</p>}

      {adminSettings?.updatedBy && adminSettings.updatedAt !== null && (
        <p className="panel__note">
          Last changed by {adminSettings.updatedBy}, {new Date(adminSettings.updatedAt).toLocaleString()}
        </p>
      )}

      <div className="panel__actions panel__actions--row">
        <button
          className="button button--primary"
          disabled={!canSave}
          onClick={() => saveSettings(candidateSettings)}
        >
          Save
        </button>
        <button className="button button--secondary" onClick={() => setAdminOpen(false)}>
          Close
        </button>
      </div>
    </section>
  );
}
