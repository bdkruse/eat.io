import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { useGame } from "@eat.io/client/state/GameProvider.js";
import { selectAwaitingYou, selectBoardFrozen, selectScreen } from "@eat.io/client/state/gameState.js";
import { useLocalState } from "../state/LocalState.js";
import { Cafeteria } from "./cafeteria/Cafeteria.js";
import { CameraRig } from "./CameraRig.js";
import { DETAIL_BUDGETS } from "./detail.js";
import { selectShot } from "./cameraShots.js";
import { GameTable } from "./game/GameTable.js";
import { Lighting } from "./Lighting.js";

/** Tall, narrow windows get the turned table shot. */
function usePortrait(): boolean {
  const query = "(max-aspect-ratio: 4/5)";
  const [portrait, setPortrait] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setPortrait(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return portrait;
}

/** The 3D canvas behind every screen. Reads the same state the panels do; decides nothing. */
export function Stage() {
  const { state } = useGame();
  const local = useLocalState();
  const screen = selectScreen(state);
  const portrait = usePortrait();
  const shot = selectShot(screen, local.customizing, portrait);
  const frozen = selectBoardFrozen(state);
  const awaitingYou = selectAwaitingYou(state);
  const inGame = screen === "game" || screen === "gameOver";
  const budget = DETAIL_BUDGETS[local.detail];

  return (
    <div className={frozen && inGame ? "stage stage--frozen" : "stage"}>
      <Canvas
        shadows={budget.shadows ? "percentage" : false}
        dpr={[1, budget.maxPixelRatio]}
        camera={{ fov: 50, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#e9e4d6"]} />
        <fog attach="fog" args={["#ece6d6", 22, 48]} />
        <Lighting shadows={budget.shadows} />
        <Cafeteria budget={budget} />
        <GameTable
          room={inGame ? state.room : null}
          result={state.result}
          yourAppearance={local.appearance}
          customizing={local.customizing && !inGame}
          awaitingYou={awaitingYou}
          selection={local.selection}
          targetCount={local.targetCount}
          interactive={screen === "game" && awaitingYou && !frozen}
          showLabels={screen === "game"}
          onTrayClick={local.clickTray}
        />
        <CameraRig shot={shot} />
      </Canvas>
    </div>
  );
}
