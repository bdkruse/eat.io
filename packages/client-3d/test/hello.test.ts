import { expect, test } from "vitest";
import { PROTOCOL_VERSION, type Profile, type ServerMessage } from "@eat.io/protocol";
import { buildHello, nextLoginToken } from "../src/connection/hello.js";

const profile: Profile = {
  username: "Riley_1",
  role: "player",
  permissions: [],
  appearance: null,
  pointsScored: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  createdAt: 1_700_000_000_000,
  lastLoginAt: null,
};

/** Feeds server messages through the tracker, the way every socket frame does. */
const trackAll = (startingLoginToken: string | null, ...messages: ServerMessage[]) =>
  messages.reduce(nextLoginToken, startingLoginToken);

test("a first hello carries only the version and the name", () => {
  expect(buildHello({ protocolVersion: PROTOCOL_VERSION, name: "Riley", sessionToken: null, loginToken: null })).toEqual({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    name: "Riley",
  });
});

test("a reconnect hello carries both the session token and the login token", () => {
  expect(
    buildHello({ protocolVersion: PROTOCOL_VERSION, name: "Riley", sessionToken: "session-1", loginToken: "login-1" }),
  ).toEqual({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    name: "Riley",
    sessionToken: "session-1",
    loginToken: "login-1",
  });
});

test("after a fresh login, the next hello includes the new login token", () => {
  const currentLoginToken = trackAll(
    null,
    { type: "welcome", playerId: "player-1", sessionToken: "session-1" },
    { type: "accountLoggedIn", profile, loginToken: "fresh-login-token" },
  );
  const reconnectHello = buildHello({
    protocolVersion: PROTOCOL_VERSION,
    name: "Riley",
    sessionToken: "session-1",
    loginToken: currentLoginToken,
  });
  expect(reconnectHello.loginToken).toBe("fresh-login-token");
});

test("a token resume's accountLoggedIn (no token in it) keeps the token already held", () => {
  const currentLoginToken = trackAll("stored-login-token", { type: "accountLoggedIn", profile });
  expect(currentLoginToken).toBe("stored-login-token");
});

test("after a logout, the next hello carries no login token", () => {
  const currentLoginToken = trackAll(
    null,
    { type: "accountLoggedIn", profile, loginToken: "fresh-login-token" },
    { type: "accountLoggedOut", reason: "requested" },
  );
  const reconnectHello = buildHello({
    protocolVersion: PROTOCOL_VERSION,
    name: "Riley",
    sessionToken: "session-1",
    loginToken: currentLoginToken,
  });
  expect(reconnectHello).not.toHaveProperty("loginToken");
});

test("logging in to a second account replaces the first account's token", () => {
  const currentLoginToken = trackAll(
    "old-login-token",
    { type: "accountLoggedOut", reason: "requested" },
    { type: "accountLoggedIn", profile, loginToken: "second-account-token" },
  );
  expect(currentLoginToken).toBe("second-account-token");
});

test("an expired resume clears the token", () => {
  expect(trackAll("stale-login-token", { type: "accountLoggedOut", reason: "expired" })).toBeNull();
});

test("unrelated messages leave the token alone", () => {
  expect(trackAll("login-token", { type: "pong" }, { type: "queueWaiting" })).toBe("login-token");
});
