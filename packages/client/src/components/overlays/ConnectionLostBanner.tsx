import { useGame } from "../../state/GameProvider.js";

export function ConnectionLostBanner() {
  const { state } = useGame();
  if (!state.identity) return null;
  if (state.connection.phase === "connected") return null;

  return (
    <div className="banner" role="status">
      Connection lost — reconnecting. The board below is frozen and may be out of date.
    </div>
  );
}
