import { ConnectionLostBanner } from "./ui/overlays/ConnectionLostBanner.js";
import { OpponentDroppedModal } from "./ui/overlays/OpponentDroppedModal.js";
import { RejectionToast } from "./ui/overlays/RejectionToast.js";
import { GameProvider, useGame } from "./state/GameProvider.js";
import { selectScreen } from "./state/gameState.js";
import { Stage } from "./scene/Stage.js";
import { LocalStateProvider, useLocalState } from "./state/LocalState.js";
import { CustomizePanel } from "./ui/CustomizePanel.js";
import { Fade } from "./ui/Fade.js";
import { GameHud } from "./ui/GameHud.js";
import { GameOverPanel } from "./ui/GameOverPanel.js";
import { HandBar } from "./ui/HandBar.js";
import { MenuPanel } from "./ui/MenuPanel.js";
import { QueuePanel } from "./ui/QueuePanel.js";
import { TopBar } from "./ui/TopBar.js";

/** Panels over the canvas. Each fades on its own, so screens cross-dissolve as the camera moves. */
function Interface() {
  const { state } = useGame();
  const { customizing } = useLocalState();
  const screen = selectScreen(state);
  const inMenus = screen === "connect" || screen === "queue";
  const editing = customizing && inMenus;

  return (
    <div className="interface">
      <TopBar showWordmark={screen === "connect" && !editing} />
      <ConnectionLostBanner />
      <Fade show={screen === "connect" && !editing} className="dock dock--left">
        <MenuPanel />
      </Fade>
      <Fade show={screen === "queue" && !editing} className="dock dock--left">
        <QueuePanel />
      </Fade>
      <Fade show={editing} className="dock dock--left">
        <CustomizePanel />
      </Fade>
      <Fade show={screen === "game" || screen === "gameOver"} className="dock dock--top">
        <GameHud />
      </Fade>
      <Fade show={screen === "game"} className="dock dock--bottom">
        <HandBar />
      </Fade>
      <Fade show={screen === "gameOver"} className="dock dock--left">
        <GameOverPanel />
      </Fade>
      <RejectionToast />
      <OpponentDroppedModal />
    </div>
  );
}

export function App() {
  return (
    <GameProvider>
      <LocalStateProvider>
        <div className="app3d">
          <Stage />
          <Interface />
        </div>
      </LocalStateProvider>
    </GameProvider>
  );
}
