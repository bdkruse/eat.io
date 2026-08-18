import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "@eat.io/protocol";
import type { Connection } from "../lobby/lobby.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

export interface LobbyLike {
  handleMessage(conn: Connection, msg: ClientMessage): void;
  handleClose(conn: Connection): void;
}

export interface Transport {
  readonly port: number;
  close(): Promise<void>;
}

export function startTransport(deps: {
  lobby: LobbyLike;
  config: Config;
  logger: Logger;
}): Promise<Transport> {
  const { lobby, config, logger } = deps;
  const wss = new WebSocketServer({ port: config.port });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (socket) => {
    const conn: Connection = {
      send: (msg: ServerMessage) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
      },
      session: null,
    };
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));

    socket.on("message", (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        conn.send({ type: "error", code: "BAD_JSON", message: "Message was not valid JSON." });
        return;
      }
      let msg: ClientMessage;
      try {
        msg = parseClientMessage(raw);
      } catch (err) {
        conn.send({ type: "error", code: "BAD_MESSAGE", message: "Message failed validation." });
        logger.debug("rejected invalid message", { err: String(err) });
        return;
      }
      try {
        lobby.handleMessage(conn, msg); // one bad handler call must not crash the process
      } catch (err) {
        logger.error("handler threw", { err: String(err) });
      }
    });

    socket.on("close", () => lobby.handleClose(conn));
    socket.on("error", (err) => logger.warn("socket error", { err: String(err) }));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, config.heartbeatIntervalMs);
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));

  return new Promise<Transport>((resolve) => {
    wss.on("listening", () => {
      const port = (wss.address() as AddressInfo).port;
      logger.info("listening", { port });
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => {
            clearInterval(heartbeat);
            for (const socket of wss.clients) socket.terminate();
            wss.close(() => res());
          }),
      });
    });
  });
}
