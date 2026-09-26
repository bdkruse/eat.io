import { useGame } from "../state/GameProvider.js";
import type { DetailLevel } from "../scene/detail.js";
import { useLocalState } from "../state/LocalState.js";

const DETAIL_OPTIONS: { level: DetailLevel; label: string }[] = [
  { level: "high", label: "High" },
  { level: "low", label: "Low" },
];

export function TopBar({ showWordmark }: { showWordmark: boolean }) {
  const { state } = useGame();
  const { detail, setDetail } = useLocalState();
  const live = state.connection.phase === "connected";
  const label = live ? "Connected" : state.connection.phase === "reconnecting" ? "Reconnecting" : "Offline";

  return (
    <header className="topbar">
      <div className={showWordmark ? "topbar__wordmark" : "topbar__wordmark topbar__wordmark--small"}>
        eat<span>.io</span>
      </div>
      <div className="topbar__right">
        <div className="detail-toggle" role="radiogroup" aria-label="Detail">
          <span className="detail-toggle__label">Detail</span>
          {DETAIL_OPTIONS.map((option) => (
            <button
              key={option.level}
              className={option.level === detail ? "detail-toggle__option detail-toggle__option--picked" : "detail-toggle__option"}
              role="radio"
              aria-checked={option.level === detail}
              onClick={() => setDetail(option.level)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="topbar__status">
          <span className={live ? "dot" : "dot dot--down"} />
          <span className="topbar__status-text">{label}</span>
        </div>
      </div>
    </header>
  );
}
