import { useGame } from "../state/GameProvider.js";

export function Header() {
  const { state } = useGame();
  const live = state.connection.phase === "connected";
  const room = state.room;

  return (
    <header className="header">
      <div className="header__wordmark">eat.io</div>
      {room && (
        <div className="header__round">
          ROUND {room.roundIndex + 1} / {room.roundCount}
        </div>
      )}
      <div className="header__status">
        <span className={live ? "dot" : "dot dot--down"} />
        {live ? "Connected" : state.connection.phase === "reconnecting" ? "Reconnecting" : "Offline"}
      </div>
    </header>
  );
}
