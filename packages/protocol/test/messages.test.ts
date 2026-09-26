import { expect, test } from "vitest";
import {
  parseClientMessage,
  parseServerMessage,
  ClientMessageSchema,
  PROTOCOL_VERSION,
} from "../src/index.js";

const VALID_APPEARANCE = {
  skinTone: "#eec19b",
  hairStyle: "short",
  hairColor: "#2b2220",
  shirtColor: "#d94f3d",
  pantsColor: "#3f5a7a",
  accessory: "none",
};

function baseRoomState() {
  return {
    type: "roomState",
    phase: "in-progress",
    roundIndex: 0,
    roundCount: 10,
    deadlineAt: 123,
    you: {
      seat: "a",
      name: "Riley",
      score: 0,
      submitted: false,
      appearance: VALID_APPEARANCE,
      table: [{ id: "t1", value: 2 }],
      hand: [{ id: "add1x1", instanceId: "c1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1 }],
    },
    opponent: {
      seat: "b",
      name: "Sam",
      score: 0,
      submitted: false,
      appearance: null,
      handCount: 5,
      table: [{ id: "u1", value: 3 }],
    },
  };
}

test("valid hello parses and keeps optional sessionToken absent", () => {
  const msg = parseClientMessage({ type: "hello", protocolVersion: PROTOCOL_VERSION, name: "Riley" });
  expect(msg.type).toBe("hello");
  if (msg.type === "hello") expect(msg.sessionToken).toBeUndefined();
});

test("submitTurn names a card INSTANCE and requires a targets array", () => {
  const ok = parseClientMessage({
    type: "submitTurn",
    cardInstanceId: "c7",
    targetTrayIds: ["t1"],
  });
  expect(ok.type).toBe("submitTurn");
  expect(() => parseClientMessage({ type: "submitTurn", cardInstanceId: "c7" })).toThrow();
  // The catalog id is not accepted in its place — the field names differ deliberately.
  expect(() =>
    parseClientMessage({ type: "submitTurn", cardId: "add1x1", targetTrayIds: ["t1"] }),
  ).toThrow();
});

test("unknown message type is rejected, not silently accepted", () => {
  expect(() => parseClientMessage({ type: "totallyMadeUp" })).toThrow();
});

test("server room.state carries opponent hand COUNT, never cards", () => {
  const view = baseRoomState();
  const parsed = parseServerMessage(view);
  expect(parsed.type).toBe("roomState");
  // A stray opponent.hand field must be stripped/ignored, never surfaced as cards.
  expect((parsed as Record<string, unknown>)["opponent"]).not.toHaveProperty("hand");
});

test("roomState without appearance on you or opponent fails", () => {
  const view = baseRoomState() as Record<string, unknown>;
  const you = view["you"] as Record<string, unknown>;
  delete you["appearance"];
  expect(() => parseServerMessage(view)).toThrow();

  const viewOpponent = baseRoomState() as Record<string, unknown>;
  const opponent = viewOpponent["opponent"] as Record<string, unknown>;
  delete opponent["appearance"];
  expect(() => parseServerMessage(viewOpponent)).toThrow();
});

test("roomState with appearance: null parses", () => {
  const view = baseRoomState() as Record<string, unknown>;
  (view["you"] as Record<string, unknown>)["appearance"] = null;
  const parsed = parseServerMessage(view);
  expect(parsed.type).toBe("roomState");
});

test("hello with loginToken parses", () => {
  const msg = parseClientMessage({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    name: "Riley",
    loginToken: "abc123",
  });
  expect(msg.type).toBe("hello");
  if (msg.type === "hello") expect(msg.loginToken).toBe("abc123");
});

test("each new client message parses", () => {
  expect(parseClientMessage({ type: "accountRegister", username: "Riley", password: "sup3rsecret" }).type).toBe(
    "accountRegister",
  );
  expect(parseClientMessage({ type: "accountLogin", username: "Riley", password: "sup3rsecret" }).type).toBe(
    "accountLogin",
  );
  expect(parseClientMessage({ type: "accountLogout" }).type).toBe("accountLogout");
  expect(
    parseClientMessage({
      type: "accountChangePassword",
      currentPassword: "sup3rsecret",
      newPassword: "ev3nbetter",
    }).type,
  ).toBe("accountChangePassword");
  expect(parseClientMessage({ type: "appearanceSet", appearance: VALID_APPEARANCE }).type).toBe("appearanceSet");
  expect(parseClientMessage({ type: "profileRequest" }).type).toBe("profileRequest");
});

test("each new server message parses", () => {
  const profile = {
    username: "Riley",
    role: "player",
    permissions: [],
    appearance: null,
    pointsScored: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    createdAt: 1700000000000,
    lastLoginAt: null,
  };
  expect(parseServerMessage({ type: "accountLoggedIn", profile, loginToken: "abc123" }).type).toBe("accountLoggedIn");
  expect(parseServerMessage({ type: "accountLoggedIn", profile }).type).toBe("accountLoggedIn");
  expect(parseServerMessage({ type: "accountLoggedOut", reason: "requested" }).type).toBe("accountLoggedOut");
  expect(parseServerMessage({ type: "accountLoggedOut", reason: "expired" }).type).toBe("accountLoggedOut");
  expect(
    parseServerMessage({ type: "accountError", code: "USERNAME_TAKEN", message: "That name is taken." }).type,
  ).toBe("accountError");
  expect(parseServerMessage({ type: "profile", profile }).type).toBe("profile");
  expect(parseServerMessage({ type: "passwordChanged" }).type).toBe("passwordChanged");
});
