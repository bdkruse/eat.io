import { useState } from "react";
import { ConnectionLostBanner } from "./ui/overlays/ConnectionLostBanner.js";
import { OpponentDroppedModal } from "./ui/overlays/OpponentDroppedModal.js";
import { RejectionToast } from "./ui/overlays/RejectionToast.js";
import { GameProvider, useGame } from "./state/GameProvider.js";
import { selectScreen } from "./state/gameState.js";
import { Stage } from "./scene/Stage.js";
import { LocalStateProvider, useLocalState } from "./state/LocalState.js";
import { AdminPanel } from "./ui/AdminPanel.js";
import { CreatorPanel } from "./ui/CreatorPanel.js";
import { CustomizePanel } from "./ui/CustomizePanel.js";
import { Fade } from "./ui/Fade.js";
import { GameHud } from "./ui/GameHud.js";
import { GameOverPanel } from "./ui/GameOverPanel.js";
import { HandBar } from "./ui/HandBar.js";
import { MenuPanel, type MenuTab } from "./ui/MenuPanel.js";
import { ProfilePanel } from "./ui/ProfilePanel.js";
import { QueuePanel } from "./ui/QueuePanel.js";
import { ShopPanel } from "./ui/ShopPanel.js";
import { TopBar } from "./ui/TopBar.js";

/** Panels over the canvas. Each fades on its own, so screens cross-dissolve as the camera moves. */
function Interface() {
  const { state } = useGame();
  const { openPanel } = useLocalState();
  // Which of the menu's three tabs is showing — lifted up here so the top bar's guest
  // "Log in" button can switch the menu to it from outside (§11).
  const [menuTab, setMenuTab] = useState<MenuTab>("guest");
  const screen = selectScreen(state);
  const inMenus = screen === "connect" || screen === "queue";
  const editingLook = openPanel === "customize" && inMenus;
  // The profile, admin, creator, and shop panels are all reachable from the menu, the queue,
  // and the game-over screen — everywhere the top bar's own buttons for them show (hidden
  // only during a game).
  const viewingProfile = openPanel === "profile" && screen !== "game";
  const viewingAdmin = openPanel === "admin" && screen !== "game";
  const viewingCreator = openPanel === "creator" && screen !== "game";
  const viewingShop = openPanel === "shop" && screen !== "game";
  const showScreenPanel = !editingLook && !viewingProfile && !viewingAdmin && !viewingCreator && !viewingShop;

  return (
    <div className="interface">
      <TopBar showWordmark={screen === "connect" && showScreenPanel} onRequestLogin={() => setMenuTab("login")} />
      <ConnectionLostBanner />
      <Fade show={screen === "connect" && showScreenPanel} className="dock dock--left">
        <MenuPanel activeTab={menuTab} onTabChange={setMenuTab} />
      </Fade>
      <Fade show={screen === "queue" && showScreenPanel} className="dock dock--left">
        <QueuePanel />
      </Fade>
      <Fade show={editingLook} className="dock dock--left">
        <CustomizePanel />
      </Fade>
      <Fade show={viewingProfile} className="dock dock--left">
        <ProfilePanel />
      </Fade>
      <Fade show={viewingAdmin} className="dock dock--left">
        <AdminPanel />
      </Fade>
      <Fade show={viewingCreator} className="dock dock--left">
        <CreatorPanel />
      </Fade>
      <Fade show={viewingShop} className="dock dock--left">
        <ShopPanel />
      </Fade>
      <Fade show={screen === "game" || screen === "gameOver"} className="dock dock--top">
        <GameHud />
      </Fade>
      <Fade show={screen === "game"} className="dock dock--bottom">
        <HandBar />
      </Fade>
      <Fade show={screen === "gameOver" && showScreenPanel} className="dock dock--left">
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
