import { useState } from "react";
import { initialServerUrl } from "../config.js";
import { useGame } from "../state/GameProvider.js";

export function ConnectScreen() {
  const { state, connect, setName } = useGame();
  const [serverUrl, setServerUrl] = useState(initialServerUrl());

  const ready = state.name.trim().length > 0 && serverUrl.trim().length > 0;

  return (
    <section className="screen connect">
      <h1 className="connect__wordmark">eat.io</h1>
      <p className="connect__tagline">a fun math game for all ages</p>

      <label className="field">
        <span className="field__label">Your name</span>
        <input
          className="field__input"
          value={state.name}
          maxLength={14}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Server</span>
        <input
          className="field__input"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
        />
      </label>

      <button disabled={!ready} onClick={() => connect(serverUrl.trim(), state.name.trim())}>
        Find a game
      </button>

      {state.connection.error && <p className="connect__explainer">{state.connection.error}</p>}

      <p className="connect__explainer">
        Trays of food travel down your lunch table. Whatever reaches the end gets eaten, and
        its number is added to your score. Play cards to pile more food onto a tray before it
        gets there. Most eaten when the rounds run out wins.
      </p>
    </section>
  );
}
