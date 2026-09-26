import { useState } from "react";
import { initialServerUrl } from "@eat.io/client/config.js";
import { useGame } from "@eat.io/client/state/GameProvider.js";
import { useLocalState } from "../state/LocalState.js";

export function MenuPanel() {
  const { state, connect, joinQueue, createPrivate, joinPrivate, setName } = useGame();
  const { setCustomizing } = useLocalState();
  const [serverUrl, setServerUrl] = useState(initialServerUrl());
  const [roomCode, setRoomCode] = useState("");

  const connected = state.connection.phase === "connected" && state.identity !== null;
  const ready = state.name.trim().length > 0 && serverUrl.trim().length > 0;

  return (
    <section className="panel panel--menu">
      <p className="panel__tagline">a fun math game for all ages</p>

      <label className="field">
        <span className="field__label">Your name</span>
        <input
          className="field__input"
          value={state.name}
          maxLength={14}
          placeholder="What do friends call you?"
          disabled={connected}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ready && !connected) connect(serverUrl.trim(), state.name.trim());
          }}
        />
      </label>

      {!connected && (
        <label className="field">
          <span className="field__label">Server</span>
          <input className="field__input field__input--quiet" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} />
        </label>
      )}

      {!connected ? (
        <button className="button button--primary" disabled={!ready} onClick={() => connect(serverUrl.trim(), state.name.trim())}>
          Connect
        </button>
      ) : (
        <div className="panel__actions">
          <button className="button button--primary" onClick={joinQueue}>
            Find a game
          </button>
          <button className="button button--secondary" onClick={createPrivate}>
            Create a private room
          </button>
          <div className="joinrow">
            <input
              className="field__input joinrow__code"
              value={roomCode}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="0000"
              aria-label="Room code"
              onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, ""))}
            />
            <button className="button button--secondary" disabled={roomCode.length !== 4} onClick={() => joinPrivate(roomCode)}>
              Join with code
            </button>
          </div>
        </div>
      )}

      <button className="button button--ghost" onClick={() => setCustomizing(true)}>
        Customize your kid
      </button>

      {state.connection.error && <p className="panel__error">{state.connection.error}</p>}

      <p className="panel__explainer">
        Trays of food travel down your side of the lunch table. Whatever reaches the end gets
        eaten, and its number is added to your score. Play cards to pile more food onto a tray
        before it gets there. Most eaten when the rounds run out wins.
      </p>
    </section>
  );
}
