import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "@eat.io/protocol";
import type { Connection } from "../lobby/lobby.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

export interface LobbyLike {
  handleMessage(conn: Connection, msg: ClientMessage): void;
  handleClose(conn: Connection): void;
  /** Optional: notified before sockets are closed so rooms can resolve cleanly. */
  shutdown?(): void;
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
  // A plain web request gets a short "ok": hosting health checks probe with ordinary HTTP,
  // and would read the WebSocket library's default 426 as a dead server.
  const httpServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("eat.io server ok\n");
  });
  const wss = new WebSocketServer({ server: httpServer });
  // A socket with an entry here has been pinged and owes us a pong.
  const awaitingPong = new Map<WebSocket, ReturnType<typeof setTimeout>>();

  function clearPong(socket: WebSocket): void {
    const pending = awaitingPong.get(socket);
    if (pending === undefined) return;
    clearTimeout(pending);
    awaitingPong.delete(socket);
  }

  wss.on("connection", (socket) => {
    const conn: Connection = {
      send: (msg: ServerMessage) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
      },
      session: null,
    };
    socket.on("pong", () => clearPong(socket));

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

    socket.on("close", () => {
      clearPong(socket);
      lobby.handleClose(conn);
    });
    socket.on("error", (err) => logger.warn("socket error", { err: String(err) }));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (awaitingPong.has(socket)) continue; // already on the clock
      socket.ping();
      const deadline = setTimeout(() => {
        awaitingPong.delete(socket);
        logger.warn("no pong within timeout; dropping socket", {
          timeoutMs: config.heartbeatTimeoutMs,
        });
        socket.terminate(); // half-open: free the seat so the grace window can start
      }, config.heartbeatTimeoutMs);
      deadline.unref?.();
      awaitingPong.set(socket, deadline);
    }
  }, config.heartbeatIntervalMs);
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));

  return new Promise<Transport>((resolve) => {
    httpServer.listen(config.port, () => {
      const port = (httpServer.address() as AddressInfo).port;
      logger.info("listening", { port });
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => {
            clearInterval(heartbeat);
            for (const socket of wss.clients) clearPong(socket);
            // Let rooms resolve and their final views flush before the sockets go.
            lobby.shutdown?.();
            for (const socket of wss.clients) socket.close(1001, "server shutting down");
            const force = setTimeout(() => {
              for (const socket of wss.clients) socket.terminate();
            }, 50);
            force.unref?.();
            wss.close(() => {
              clearTimeout(force);
              httpServer.close(() => res());
            });
          }),
      });
    });
  });
}
