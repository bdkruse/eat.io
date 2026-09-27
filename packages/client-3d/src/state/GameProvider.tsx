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
import type { ClientMessage, DeckEntry, GameSettings, ServerMessage } from "@eat.io/protocol";
import type { Appearance } from "../appearance/appearance.js";
import { resumeServerUrl } from "../config.js";
import { wakeServer } from "../connection/wakeServer.js";
import type { ConnectionState } from "../connection/connectionState.js";
import { useConnection } from "../connection/useConnection.js";
import { gameReducer } from "./gameReducer.js";
import { initialAppState, selectBackToMenuStaysConnected, type AppState } from "./gameState.js";
import { clearLoginToken, loadLoginToken, loadServerUrl, saveLoginToken, saveServerUrl } from "./loginStorage.js";
import { createPendingAccountMessageHolder } from "./pendingAccountMessage.js";

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
  requestSettings(): void;
  saveSettings(settings: GameSettings): void;
  requestDeck(): void;
  saveDeck(entries: DeckEntry[]): void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialAppState);

  // `send` (from useConnection, below) is not available yet at the point handleMessage is
  // defined, so it is read through this ref instead — updated by the effect further down,
  // synchronously each render, well before any socket message could arrive.
  const sendRef = useRef<(msg: ClientMessage) => void>(() => {});
  // The register/login command connectAndRegister/connectAndLogin want to send right
  // after the welcome that follows their connect (§11). A plain connect or a disconnect
  // must drop anything left waiting here, so it can never leak into a later, unrelated
  // connection (fix round 1).
  const pendingAccountMessageHolderRef = useRef(createPendingAccountMessageHolder());
  // Same reason as sendRef: the disconnect below is defined after handleMessage needs it.
  const disconnectRef = useRef<() => void>(() => {});

  const handleMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === "welcome") {
      const pending = pendingAccountMessageHolderRef.current.take();
      if (pending) sendRef.current(pending);
    }
    if (msg.type === "accountLoggedIn" && msg.loginToken) {
      saveLoginToken(msg.loginToken);
    }
    if (msg.type === "accountLoggedOut") {
      clearLoginToken();
    }
    dispatch({ kind: "server", msg });
    // A logout (requested, or an expired resume) ends the connection too: the reducer has
    // just put the pre-connect menu back, and a connected guest with no name must not be
    // left behind (final review, item 3).
    if (msg.type === "accountLoggedOut") disconnectRef.current();
  }, []);

  const handleConnectionChange = useCallback((next: ConnectionState) => {
    dispatch({ kind: "connection", state: next });
  }, []);

  const { connect: rawConnect, disconnect: rawDisconnect, send } = useConnection(
    handleMessage,
    handleConnectionChange,
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // The connectAndRegister/connectAndLogin path below sets a pending message and then
  // calls THIS, not the public `connect` — the public one clears any pending message on
  // the way in, which would otherwise wipe out the message they just set.
  const connectKeepingPending = useCallback(
    (url: string, name: string, loginToken?: string) => {
      saveServerUrl(url);
      rawConnect(url, name, loginToken);
    },
    [rawConnect],
  );

  const connect = useCallback(
    (url: string, name: string, loginToken?: string) => {
      pendingAccountMessageHolderRef.current.clear();
      connectKeepingPending(url, name, loginToken);
    },
    [connectKeepingPending],
  );

  const disconnect = useCallback(() => {
    pendingAccountMessageHolderRef.current.clear();
    rawDisconnect();
  }, [rawDisconnect]);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  // A stored login token means a returning player — resume the connection before they
  // touch anything, and fall back to the menu as usual if that fails (§11). Marked as a
  // pending account attempt so the guest-look effect does not fire mid-resume and
  // overwrite the account's real saved look the instant `welcome` arrives (fix round 1).
  // Start a sleeping server while the player is still reading the menu, so it is
  // usually awake by the time they press Connect.
  useEffect(() => {
    wakeServer(resumeServerUrl(loadServerUrl()));
  }, []);

  useEffect(() => {
    const loginToken = loadLoginToken();
    if (!loginToken) return;
    dispatch({ kind: "accountAttemptStarted" });
    connect(resumeServerUrl(loadServerUrl()), "Player", loginToken);
    // Runs once, on mount, to auto-resume — not on every change to `connect`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<GameApi>(
    () => ({
      state,
      connect,
      connectAndRegister: (url, username, password) => {
        dispatch({ kind: "accountAttemptStarted" });
        pendingAccountMessageHolderRef.current.set({ type: "accountRegister", username, password });
        connectKeepingPending(url, username);
      },
      connectAndLogin: (url, username, password) => {
        dispatch({ kind: "accountAttemptStarted" });
        pendingAccountMessageHolderRef.current.set({ type: "accountLogin", username, password });
        connectKeepingPending(url, username);
      },
      leaveToMenu: () => {
        // A logged-in player stays connected and returns to the connected menu; a guest
        // disconnects and starts over at the pre-connect menu (final review, item 2).
        if (selectBackToMenuStaysConnected(state)) {
          dispatch({ kind: "backToConnectedMenu" });
          return;
        }
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
      register: (username, password) => {
        dispatch({ kind: "accountAttemptStarted" });
        send({ type: "accountRegister", username, password });
      },
      login: (username, password) => {
        dispatch({ kind: "accountAttemptStarted" });
        send({ type: "accountLogin", username, password });
      },
      logout: () => send({ type: "accountLogout" }),
      changePassword: (currentPassword, newPassword) =>
        send({ type: "accountChangePassword", currentPassword, newPassword }),
      setAppearance: (appearance) => send({ type: "appearanceSet", appearance }),
      requestProfile: () => send({ type: "profileRequest" }),
      dismissAccountError: () => dispatch({ kind: "dismissAccountError" }),
      requestSettings: () => {
        dispatch({ kind: "settingsRequested" });
        send({ type: "settingsRequest" });
      },
      saveSettings: (settings) => {
        dispatch({ kind: "settingsSaveStarted" });
        send({
          type: "settingsSave",
          roundCount: settings.roundCount,
          turnSeconds: settings.turnSeconds,
          handSize: settings.handSize,
        });
      },
      requestDeck: () => {
        dispatch({ kind: "deckRequested" });
        send({ type: "deckRequest" });
      },
      saveDeck: (entries) => {
        dispatch({ kind: "deckSaveStarted" });
        send({ type: "deckSave", cards: entries });
      },
    }),
    [state, connect, connectKeepingPending, disconnect, send],
  );

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const api = useContext(GameContext);
  if (!api) throw new Error("useGame must be used inside <GameProvider>");
  return api;
}
