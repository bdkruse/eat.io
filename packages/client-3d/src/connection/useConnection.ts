import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@eat.io/protocol";
import { buildHello, nextLoginToken } from "./hello.js";
import {
  backoffMs,
  connectionReducer,
  initialConnectionState,
  type ConnectionEvent,
  type ConnectionState,
} from "./connectionState.js";

export interface UseConnection {
  connection: ConnectionState;
  connect(url: string, name: string, loginToken?: string): void;
  disconnect(): void;
  send(msg: ClientMessage): void;
}

export function useConnection(
  onMessage: (msg: ServerMessage) => void,
  onConnectionChange: (state: ConnectionState) => void,
): UseConnection {
  const [connection, setConnection] = useState<ConnectionState>(initialConnectionState);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const targetRef = useRef<{ url: string; name: string } | null>(null);
  // The account's CURRENT login token, read by every socket open. Seeded by connect()
  // and kept up to date from the messages themselves, so a fresh login, a register, or a
  // logout is reflected in the very next reconnect's hello (final review, item 1).
  const loginTokenRef = useRef<string | null>(null);
  const wantOpenRef = useRef(false);
  const stateRef = useRef<ConnectionState>(initialConnectionState);

  // Callbacks live in refs so the socket effect never re-subscribes on a re-render.
  const messageRef = useRef(onMessage);
  const changeRef = useRef(onConnectionChange);
  useEffect(() => {
    messageRef.current = onMessage;
    changeRef.current = onConnectionChange;
  }, [onMessage, onConnectionChange]);

  const applyEvent = useCallback((event: ConnectionEvent) => {
    const next = connectionReducer(stateRef.current, event);
    stateRef.current = next;
    setConnection(next);
    changeRef.current(next);
  }, []);

  const openSocket = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;

    applyEvent({ type: "connect" });
    const socket = new WebSocket(target.url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      applyEvent({ type: "opened" });
      // Built fresh on every open, not just the first (§11: a login must survive a
      // dropped socket too).
      const hello = buildHello({
        protocolVersion: PROTOCOL_VERSION,
        name: target.name,
        sessionToken: sessionRef.current,
        loginToken: loginTokenRef.current,
      });
      socket.send(JSON.stringify(hello));
    });

    socket.addEventListener("message", (event) => {
      let msg: ServerMessage;
      try {
        msg = parseServerMessage(JSON.parse(String(event.data)));
      } catch (error) {
        // A frame we cannot understand is a logged error, never a crash and never a
        // silently mangled board (§2.4).
        console.error("eat.io: discarded an invalid server frame", error);
        return;
      }
      if (msg.type === "welcome") sessionRef.current = msg.sessionToken;
      loginTokenRef.current = nextLoginToken(loginTokenRef.current, msg);
      messageRef.current(msg);
    });

    socket.addEventListener("close", () => {
      socketRef.current = null;
      if (!wantOpenRef.current) {
        applyEvent({ type: "closed", hadSession: false });
        return;
      }
      applyEvent({ type: "closed", hadSession: sessionRef.current !== null });
      const delay = backoffMs(stateRef.current.attempt);
      retryRef.current = setTimeout(openSocket, delay);
    });

    socket.addEventListener("error", () => {
      // 'close' always follows; recording the reason here keeps the banner honest.
      applyEvent({ type: "failed", error: "Could not reach the server." });
    });
  }, [applyEvent]);

  const connect = useCallback(
    (url: string, name: string, loginToken?: string) => {
      targetRef.current = { url, name };
      wantOpenRef.current = true;
      sessionRef.current = null; // a fresh connect is a new session, not a reconnect
      loginTokenRef.current = loginToken ?? null;
      openSocket();
    },
    [openSocket],
  );

  const disconnect = useCallback(() => {
    wantOpenRef.current = false;
    sessionRef.current = null;
    loginTokenRef.current = null;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    applyEvent({ type: "reset" });
  }, [applyEvent]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(msg));
  }, []);

  // Every effect that opens a connection or sets a timer cleans up after itself (§2.7).
  useEffect(() => {
    return () => {
      wantOpenRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, []);

  return { connection, connect, disconnect, send };
}
