import { Header } from "./components/Header.js";
import { ConnectionLostBanner } from "./components/overlays/ConnectionLostBanner.js";
import { OpponentDroppedModal } from "./components/overlays/OpponentDroppedModal.js";
import { RejectionToast } from "./components/overlays/RejectionToast.js";
import { GameProvider, useGame } from "./state/GameProvider.js";
import { selectScreen } from "./state/gameState.js";
import { ConnectScreen } from "./screens/ConnectScreen.js";
import { QueueScreen } from "./screens/QueueScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { GameOverScreen } from "./screens/GameOverScreen.js";

function CurrentScreen() {
  const { state } = useGame();
  switch (selectScreen(state)) {
    case "connect":
      return <ConnectScreen />;
    case "queue":
      return <QueueScreen />;
    case "game":
      return <GameScreen />;
    case "gameOver":
      return <GameOverScreen />;
  }
}

export function App() {
  return (
    <GameProvider>
      <div className="app">
        <Header />
        <ConnectionLostBanner />
        <CurrentScreen />
        <RejectionToast />
        <OpponentDroppedModal />
      </div>
    </GameProvider>
  );
}
