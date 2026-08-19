import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { ServerMessage } from "@eat.io/protocol";
import type { ConnectionState } from "../connection/connectionState.js";
import { useConnection } from "../connection/useConnection.js";
import { gameReducer } from "./gameReducer.js";
import { initialAppState, type AppState } from "./gameState.js";

export interface GameApi {
  state: AppState;
  connect(url: string, name: string): void;
  leaveToMenu(): void;
  joinQueue(): void;
  cancelQueue(): void;
  createPrivate(): void;
  joinPrivate(code: string): void;
  submitTurn(cardId: string, targetTrayIds: string[]): void;
  leaveRoom(): void;
  playAgain(): void;
  dismissRejection(): void;
  noteLocalRejection(message: string): void;
  setName(name: string): void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialAppState);

  const handleMessage = useCallback((msg: ServerMessage) => {
    dispatch({ kind: "server", msg });
  }, []);

  const handleConnectionChange = useCallback((next: ConnectionState) => {
    dispatch({ kind: "connection", state: next });
  }, []);

  const { connect, disconnect, send } = useConnection(handleMessage, handleConnectionChange);

  const api = useMemo<GameApi>(
    () => ({
      state,
      connect,
      leaveToMenu: () => {
        disconnect();
        dispatch({ kind: "backToMenu" });
      },
      joinQueue: () => send({ type: "queueJoin" }),
      cancelQueue: () => send({ type: "queueCancel" }),
      createPrivate: () => send({ type: "roomCreatePrivate" }),
      joinPrivate: (code) => send({ type: "roomJoinPrivate", code }),
      submitTurn: (cardId, targetTrayIds) => send({ type: "submitTurn", cardId, targetTrayIds }),
      leaveRoom: () => send({ type: "roomLeave" }),
      playAgain: () => {
        dispatch({ kind: "playAgain" });
        send({ type: "queueJoin" });
      },
      dismissRejection: () => dispatch({ kind: "dismissRejection" }),
      noteLocalRejection: (message) => dispatch({ kind: "localRejection", message }),
      setName: (name) => dispatch({ kind: "nameChanged", name }),
    }),
    [state, connect, disconnect, send],
  );

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const api = useContext(GameContext);
  if (!api) throw new Error("useGame must be used inside <GameProvider>");
  return api;
}
