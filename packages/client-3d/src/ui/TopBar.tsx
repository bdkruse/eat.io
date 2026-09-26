import { useGame } from "@eat.io/client/state/GameProvider.js";

export function TopBar({ showWordmark }: { showWordmark: boolean }) {
  const { state } = useGame();
  const live = state.connection.phase === "connected";
  const label = live ? "Connected" : state.connection.phase === "reconnecting" ? "Reconnecting" : "Offline";

  return (
    <header className="topbar">
      <div className={showWordmark ? "topbar__wordmark" : "topbar__wordmark topbar__wordmark--small"}>
        eat<span>.io</span>
      </div>
      <div className="topbar__status">
        <span className={live ? "dot" : "dot dot--down"} />
        {label}
      </div>
    </header>
  );
}
