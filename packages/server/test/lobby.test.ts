import { expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomStateMessage,
  type ServerMessage,
  type WelcomeMessage,
} from "@eat.io/protocol";
import { defaultRules } from "../src/engine/rules/index.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { manualTime } from "../src/lobby/timers.js";
import { Matchmaker } from "../src/lobby/matchmaking.js";
import { RoomRegistry } from "../src/lobby/registry.js";
import { Lobby, type Connection } from "../src/lobby/lobby.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";

function makeLobby() {
  const time = manualTime();
  let idSeq = 0, tokSeq = 0, codeSeq = 0;
  const lobby = new Lobby({
    config: loadConfig({ RNG_SEED: "5" }),
    rules: defaultRules,
    clock: time.clock,
    timers: time.timers,
    registry: new RoomRegistry(),
    matchmaker: new Matchmaker(() => `C${++codeSeq}`),
    logger: createLogger("error"),
    genId: () => `player-${++idSeq}`,
    genToken: () => `tok-${++tokSeq}`,
    accounts: new AccountStore(openAccountsDatabase(":memory:"), time.clock),
  });
  return { lobby, time };
}

function conn() {
  const out: ServerMessage[] = [];
  const c: Connection = { send: (m) => out.push(m), session: null };
  return { c, out };
}

const hello = (name: string, sessionToken?: string): ClientMessage =>
  sessionToken
    ? { type: "hello", protocolVersion: PROTOCOL_VERSION, name, sessionToken }
    : { type: "hello", protocolVersion: PROTOCOL_VERSION, name };

const lastOf = (out: ServerMessage[], type: ServerMessage["type"]) =>
  [...out].reverse().find((m) => m.type === type);

test("hello mints a session and returns welcome", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  const welcome = a.out[0] as WelcomeMessage;
  expect(welcome.type).toBe("welcome");
  expect(a.c.session?.id).toBe(welcome.playerId);
});

test("a protocol version mismatch is rejected", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, { type: "hello", protocolVersion: 999, name: "Riley" });
  expect(a.out[0]).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH" });
});

test("public queue pairs two players into a live room", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  expect(lastOf(a.out, "queueWaiting")).toBeDefined();
  lobby.handleMessage(b.c, { type: "queueJoin" });
  expect(lastOf(a.out, "roomState")).toBeDefined();
  expect(lastOf(b.out, "roomState")).toBeDefined();
});

test("submitTurn is routed to the player's room", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });
  const v = lastOf(a.out, "roomState") as RoomStateMessage;
  const card = v.you.hand.find((c) => c.targets === 1)!;
  lobby.handleMessage(a.c, {
    type: "submitTurn",
    cardInstanceId: card.instanceId,
    targetTrayIds: [v.you.table[0]!.id],
  });
  expect(lastOf(a.out, "actionAccepted")).toBeDefined();
});

test("submitTurn with no room is explicitly rejected", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(a.c, { type: "submitTurn", cardInstanceId: "x", targetTrayIds: [] });
  expect(lastOf(a.out, "actionRejected")).toMatchObject({ code: "NOT_IN_ROOM" });
});

test("ping is answered with pong", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(a.c, { type: "ping" });
  expect(lastOf(a.out, "pong")).toEqual({ type: "pong" });
});

test("a dropped player can reconnect with their token and resume the room", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  const token = (a.out[0] as WelcomeMessage).sessionToken;
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });

  lobby.handleClose(a.c); // p1 drops
  expect(lastOf(b.out, "opponentDisconnected")).toBeDefined();

  const a2 = conn();
  lobby.handleMessage(a2.c, hello("Riley", token));
  expect(a2.out[0]).toMatchObject({ type: "welcome" });
  expect(lastOf(b.out, "opponentReconnected")).toBeDefined();
  expect((lastOf(a2.out, "roomState") as RoomStateMessage).phase).toBe("in-progress");
});

test("private room: host gets a code, guest joins it", () => {
  const { lobby } = makeLobby();
  const host = conn(); const guest = conn();
  lobby.handleMessage(host.c, hello("Riley"));
  lobby.handleMessage(guest.c, hello("Sam"));
  lobby.handleMessage(host.c, { type: "roomCreatePrivate" });
  const joined = lastOf(host.out, "roomJoinedPrivate") as { type: "roomJoinedPrivate"; code: string };
  expect(joined.code).toBe("C1");
  lobby.handleMessage(guest.c, { type: "roomJoinPrivate", code: "C1" });
  expect(lastOf(host.out, "roomState")).toBeDefined();
  expect(lastOf(guest.out, "roomState")).toBeDefined();
});

test("queueCancel is acknowledged, not silently absorbed", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(a.c, { type: "queueCancel" });
  expect(lastOf(a.out, "queueCancelled")).toEqual({ type: "queueCancelled" });
});

test("roomLeave is acknowledged even when the player is in no room", () => {
  const { lobby } = makeLobby();
  const a = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(a.c, { type: "roomLeave" });
  expect(lastOf(a.out, "roomLeft")).toEqual({ type: "roomLeft" });
});

test("leaving a live room acks and abandons it for the opponent", () => {
  const { lobby } = makeLobby();
  const a = conn(); const b = conn();
  lobby.handleMessage(a.c, hello("Riley"));
  lobby.handleMessage(b.c, hello("Sam"));
  lobby.handleMessage(a.c, { type: "queueJoin" });
  lobby.handleMessage(b.c, { type: "queueJoin" });
  lobby.handleMessage(a.c, { type: "roomLeave" });
  expect(lastOf(a.out, "roomLeft")).toBeDefined();
  expect((lastOf(b.out, "roomState") as RoomStateMessage).phase).toBe("abandoned");
});
