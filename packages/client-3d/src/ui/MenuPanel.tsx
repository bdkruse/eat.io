import { useState } from "react";
import { initialServerUrl, serverIsConfigured } from "../config.js";
import { useGame } from "../state/GameProvider.js";
import { useLocalState } from "../state/LocalState.js";
import { AccountForm } from "./AccountForm.js";

export type MenuTab = "guest" | "login" | "register";

const TAB_LABELS: Record<MenuTab, string> = {
  guest: "Play as guest",
  login: "Log in",
  register: "Create account",
};

const MENU_TABS: MenuTab[] = ["guest", "login", "register"];

export function MenuPanel({
  activeTab,
  onTabChange,
}: {
  activeTab: MenuTab;
  onTabChange: (tab: MenuTab) => void;
}) {
  const {
    state,
    connect,
    connectAndLogin,
    connectAndRegister,
    login,
    register,
    joinQueue,
    createPrivate,
    joinPrivate,
    setName,
    dismissAccountError,
  } = useGame();
  const { setCustomizing } = useLocalState();
  const [serverUrl, setServerUrl] = useState(initialServerUrl());
  const [roomCode, setRoomCode] = useState("");
  const askForServer = !serverIsConfigured();

  const connected = state.connection.phase === "connected" && state.identity !== null;
  // A second attempt cannot start before the first resolves (§11 rulings).
  const waking = state.connection.phase === "waking";
  const busy = state.accountPending || state.connection.phase === "connecting" || waking;
  const ready = state.name.trim().length > 0 && serverUrl.trim().length > 0;
  const isGuestAccount = connected && state.account === null;

  const pickTab = (tab: MenuTab) => {
    dismissAccountError();
    onTabChange(tab);
  };

  return (
    <section className="panel panel--menu">
      <p className="panel__tagline">a fun math game for all ages</p>

      {!connected && (
        <div className="chips" role="tablist" aria-label="How to play">
          {MENU_TABS.map((tab) => (
            <button
              key={tab}
              className={tab === activeTab ? "chip chip--picked" : "chip"}
              role="tab"
              aria-selected={tab === activeTab}
              onClick={() => pickTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      )}

      {!connected && askForServer && (
        <label className="field">
          <span className="field__label">Server</span>
          <input
            className="field__input field__input--quiet"
            value={serverUrl}
            disabled={busy}
            onChange={(event) => setServerUrl(event.target.value)}
          />
        </label>
      )}

      {!connected && activeTab === "guest" && (
        <>
          <label className="field">
            <span className="field__label">Your name</span>
            <input
              className="field__input"
              value={state.name}
              maxLength={14}
              placeholder="What do friends call you?"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && ready && !busy) connect(serverUrl.trim(), state.name.trim());
              }}
            />
          </label>
          <button
            className="button button--primary"
            disabled={!ready || busy}
            onClick={() => connect(serverUrl.trim(), state.name.trim())}
          >
            Connect
          </button>
        </>
      )}

      {!connected && activeTab === "login" && (
        <AccountForm
          mode="login"
          disabled={busy}
          submitLabel="Log in"
          onSubmit={(username, password) => connectAndLogin(serverUrl.trim(), username, password)}
        />
      )}

      {!connected && activeTab === "register" && (
        <AccountForm
          mode="register"
          disabled={busy}
          submitLabel="Create account"
          onSubmit={(username, password) => connectAndRegister(serverUrl.trim(), username, password)}
        />
      )}

      {connected && (
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

      {isGuestAccount && activeTab === "guest" && (
        <p className="panel__note">
          Playing as a guest.{" "}
          <button className="link-button" onClick={() => pickTab("login")}>
            Log in
          </button>{" "}
          or{" "}
          <button className="link-button" onClick={() => pickTab("register")}>
            create an account
          </button>
          .
        </p>
      )}

      {isGuestAccount && (activeTab === "login" || activeTab === "register") && (
        <>
          <div className="chips" role="tablist" aria-label="Log in or create an account">
            <button
              className={activeTab === "login" ? "chip chip--picked" : "chip"}
              role="tab"
              aria-selected={activeTab === "login"}
              onClick={() => pickTab("login")}
            >
              Log in
            </button>
            <button
              className={activeTab === "register" ? "chip chip--picked" : "chip"}
              role="tab"
              aria-selected={activeTab === "register"}
              onClick={() => pickTab("register")}
            >
              Create account
            </button>
          </div>
          <AccountForm
            mode={activeTab}
            disabled={busy}
            submitLabel={activeTab === "login" ? "Log in" : "Create account"}
            onSubmit={(username, password) =>
              activeTab === "login" ? login(username, password) : register(username, password)
            }
          />
        </>
      )}

      <button className="button button--ghost" onClick={() => setCustomizing(true)}>
        Customize your kid
      </button>

      {state.accountError && <p className="panel__error">{state.accountError.message}</p>}
      {waking && <p className="panel__note">Waking the server… this can take up to 20 seconds.</p>}
      {state.connection.error && <p className="panel__error">{state.connection.error}</p>}

      <p className="panel__explainer">
        Trays of food travel down your side of the lunch table. Whatever reaches the end gets
        eaten, and its number is added to your score. Play cards to pile more food onto a tray
        before it gets there. Most eaten when the rounds run out wins.
      </p>
    </section>
  );
}
