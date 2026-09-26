import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { ClientMessage, ServerMessage } from "@eat.io/protocol";
import type { Appearance } from "../appearance/appearance.js";
import { resumeServerUrl } from "../config.js";
import type { ConnectionState } from "../connection/connectionState.js";
import { useConnection } from "../connection/useConnection.js";
import { gameReducer } from "./gameReducer.js";
import { initialAppState, type AppState } from "./gameState.js";
import { clearLoginToken, loadLoginToken, loadServerUrl, saveLoginToken, saveServerUrl } from "./loginStorage.js";

export interface GameApi {
  state: AppState;
  connect(url: string, name: string, loginToken?: string): void;
  /** Connects with the username as the hello name, then registers once welcomed. */
  connectAndRegister(url: string, username: string, password: string): void;
  /** Connects with the username as the hello name, then logs in once welcomed. */
  connectAndLogin(url: string, username: string, password: string): void;
  leaveToMenu(): void;
  joinQueue(): void;
  cancelQueue(): void;
  createPrivate(): void;
  joinPrivate(code: string): void;
  submitTurn(cardInstanceId: string, targetTrayIds: string[]): void;
  leaveRoom(): void;
  playAgain(): void;
  dismissRejection(): void;
  noteLocalRejection(message: string): void;
  setName(name: string): void;
  register(username: string, password: string): void;
  login(username: string, password: string): void;
  logout(): void;
  changePassword(currentPassword: string, newPassword: string): void;
  setAppearance(appearance: Appearance): void;
  requestProfile(): void;
  dismissAccountError(): void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialAppState);

  // `send` (from useConnection, below) is not available yet at the point handleMessage is
  // defined, so it is read through this ref instead — updated by the effect further down,
  // synchronously each render, well before any socket message could arrive.
  const sendRef = useRef<(msg: ClientMessage) => void>(() => {});
  // The register/login command connectAndRegister/connectAndLogin want to send right
  // after the welcome that follows their connect (§11).
  const pendingAccountMessageRef = useRef<ClientMessage | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === "welcome" && pendingAccountMessageRef.current) {
      sendRef.current(pendingAccountMessageRef.current);
      pendingAccountMessageRef.current = null;
    }
    if (msg.type === "accountLoggedIn" && msg.loginToken) {
      saveLoginToken(msg.loginToken);
    }
    if (msg.type === "accountLoggedOut") {
      clearLoginToken();
    }
    dispatch({ kind: "server", msg });
  }, []);

  const handleConnectionChange = useCallback((next: ConnectionState) => {
    dispatch({ kind: "connection", state: next });
  }, []);

  const { connect: rawConnect, disconnect, send } = useConnection(handleMessage, handleConnectionChange);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const connect = useCallback(
    (url: string, name: string, loginToken?: string) => {
      saveServerUrl(url);
      rawConnect(url, name, loginToken);
    },
    [rawConnect],
  );

  // A stored login token means a returning player — resume the connection before they
  // touch anything, and fall back to the menu as usual if that fails (§11).
  useEffect(() => {
    const loginToken = loadLoginToken();
    if (!loginToken) return;
    connect(resumeServerUrl(loadServerUrl()), "Player", loginToken);
    // Runs once, on mount, to auto-resume — not on every change to `connect`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<GameApi>(
    () => ({
      state,
      connect,
      connectAndRegister: (url, username, password) => {
        pendingAccountMessageRef.current = { type: "accountRegister", username, password };
        connect(url, username);
      },
      connectAndLogin: (url, username, password) => {
        pendingAccountMessageRef.current = { type: "accountLogin", username, password };
        connect(url, username);
      },
      leaveToMenu: () => {
        disconnect();
        dispatch({ kind: "backToMenu" });
      },
      joinQueue: () => send({ type: "queueJoin" }),
      cancelQueue: () => send({ type: "queueCancel" }),
      createPrivate: () => send({ type: "roomCreatePrivate" }),
      joinPrivate: (code) => send({ type: "roomJoinPrivate", code }),
      submitTurn: (cardInstanceId, targetTrayIds) =>
        send({ type: "submitTurn", cardInstanceId, targetTrayIds }),
      leaveRoom: () => send({ type: "roomLeave" }),
      playAgain: () => {
        dispatch({ kind: "playAgain" });
        send({ type: "queueJoin" });
      },
      dismissRejection: () => dispatch({ kind: "dismissRejection" }),
      noteLocalRejection: (message) => dispatch({ kind: "localRejection", message }),
      setName: (name) => dispatch({ kind: "nameChanged", name }),
      register: (username, password) => send({ type: "accountRegister", username, password }),
      login: (username, password) => send({ type: "accountLogin", username, password }),
      logout: () => send({ type: "accountLogout" }),
      changePassword: (currentPassword, newPassword) =>
        send({ type: "accountChangePassword", currentPassword, newPassword }),
      setAppearance: (appearance) => send({ type: "appearanceSet", appearance }),
      requestProfile: () => send({ type: "profileRequest" }),
      dismissAccountError: () => dispatch({ kind: "dismissAccountError" }),
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
