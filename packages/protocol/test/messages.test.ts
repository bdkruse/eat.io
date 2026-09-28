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
    mode: "match",
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
      extraServings: [],
    },
    opponent: {
      seat: "b",
      name: "Sam",
      score: 0,
      submitted: false,
      appearance: null,
      handCount: 5,
      table: [{ id: "u1", value: 3 }],
      extraServings: [2, 2],
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

test("roomState without mode fails", () => {
  const { mode: _mode, ...roomStateWithoutMode } = baseRoomState();
  expect(() => parseServerMessage(roomStateWithoutMode)).toThrow();
});

test("roomState mode is match or practice and nothing else", () => {
  for (const mode of ["match", "practice"]) {
    const parsed = parseServerMessage({ ...baseRoomState(), mode });
    if (parsed.type !== "roomState") throw new Error("expected roomState");
    expect(parsed.mode).toBe(mode);
  }
  expect(() => parseServerMessage({ ...baseRoomState(), mode: "tutorial" })).toThrow();
});

test("practiceStart parses as a client message", () => {
  expect(parseClientMessage({ type: "practiceStart" })).toEqual({ type: "practiceStart" });
});

test("a shop item view of each clothing kind parses", () => {
  for (const kind of ["top", "onePiece", "graphic"]) {
    const shopItem = { id: `${kind}.example`, name: "Example", kind, price: 30, available: true, owned: false };
    expect(parseServerMessage({ type: "shop", items: [shopItem], balance: 0 }).type).toBe("shop");
  }
});

test("roomState with appearance: null parses", () => {
  const view = baseRoomState() as Record<string, unknown>;
  (view["you"] as Record<string, unknown>)["appearance"] = null;
  const parsed = parseServerMessage(view);
  expect(parsed.type).toBe("roomState");
});

test("roomState without extraServings on you or opponent fails", () => {
  const view = baseRoomState() as Record<string, unknown>;
  const you = view["you"] as Record<string, unknown>;
  delete you["extraServings"];
  expect(() => parseServerMessage(view)).toThrow();

  const viewOpponent = baseRoomState() as Record<string, unknown>;
  const opponent = viewOpponent["opponent"] as Record<string, unknown>;
  delete opponent["extraServings"];
  expect(() => parseServerMessage(viewOpponent)).toThrow();
});

test("a tray's bonus is optional and, when present, a positive whole number", () => {
  const view = baseRoomState() as Record<string, unknown>;
  const you = view["you"] as Record<string, unknown>;
  you["table"] = [
    { id: "t1", value: 2 },
    { id: "t2", value: 5, bonus: 2 },
  ];
  const parsed = parseServerMessage(view);
  if (parsed.type !== "roomState") throw new Error("expected roomState");
  expect(parsed.you.table[0]).not.toHaveProperty("bonus");
  expect(parsed.you.table[1]!.bonus).toBe(2);

  for (const badBonus of [0, -1, 1.5]) {
    you["table"] = [{ id: "t1", value: 2, bonus: badBonus }];
    expect(() => parseServerMessage(view)).toThrow();
  }
});

test("CardView with targets: 0 parses, and turns is optional", () => {
  const view = baseRoomState() as Record<string, unknown>;
  const you = view["you"] as Record<string, unknown>;
  you["hand"] = [
    { id: "addAll1", instanceId: "c9", name: "Add One Food To Every Tray", action: "addAll", amount: 1, targets: 0 },
    {
      id: "servings2x2",
      instanceId: "c10",
      name: "Extra Servings",
      action: "extraServings",
      amount: 2,
      targets: 0,
      turns: 2,
    },
  ];
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

test("each v4 admin client message parses", () => {
  expect(parseClientMessage({ type: "settingsRequest" }).type).toBe("settingsRequest");
  expect(
    parseClientMessage({ type: "settingsSave", roundCount: 20, turnSeconds: 20, handSize: 5 }).type,
  ).toBe("settingsSave");
  // settingsSave fields are loose z.number() on purpose, so a fraction still parses here —
  // it is settingsProblem's job to refuse it with INVALID_SETTINGS.
  expect(
    parseClientMessage({ type: "settingsSave", roundCount: 20.5, turnSeconds: 20, handSize: 5 }).type,
  ).toBe("settingsSave");
  expect(parseClientMessage({ type: "deckRequest" }).type).toBe("deckRequest");
  expect(
    parseClientMessage({ type: "deckSave", cards: [{ cardId: "add1x1", copies: 5 }] }).type,
  ).toBe("deckSave");
});

test("each v4 admin server message parses", () => {
  expect(
    parseServerMessage({
      type: "settings",
      settings: { roundCount: 20, turnSeconds: 20, handSize: 5 },
      updatedAt: 1700000000000,
      updatedBy: "Riley",
    }).type,
  ).toBe("settings");
  expect(
    parseServerMessage({
      type: "settings",
      settings: { roundCount: 20, turnSeconds: 20, handSize: 5 },
      updatedAt: null,
      updatedBy: null,
    }).type,
  ).toBe("settings");
  expect(
    parseServerMessage({
      type: "deck",
      cards: [
        { id: "add1x1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1, copies: 5 },
        {
          id: "servings2x2",
          name: "Extra Servings",
          action: "extraServings",
          amount: 2,
          targets: 0,
          turns: 2,
          copies: 1,
        },
      ],
      total: 40,
      updatedAt: null,
      updatedBy: null,
    }).type,
  ).toBe("deck");
  expect(
    parseServerMessage({ type: "adminError", code: "FORBIDDEN", message: "Not allowed." }).type,
  ).toBe("adminError");
});

test("deck card view has no instanceId", () => {
  const parsed = parseServerMessage({
    type: "deck",
    cards: [{ id: "add1x1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1, copies: 5 }],
    total: 40,
    updatedAt: null,
    updatedBy: null,
  });
  if (parsed.type !== "deck") throw new Error("expected a deck message");
  expect(parsed.cards[0]).not.toHaveProperty("instanceId");
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
    lunchMoney: 0,
    ownedItems: [],
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

test("each shop client message parses", () => {
  expect(parseClientMessage({ type: "shopRequest" }).type).toBe("shopRequest");
  expect(parseClientMessage({ type: "shopBuy", itemId: "extra.crown" }).type).toBe("shopBuy");
  expect(() => parseClientMessage({ type: "shopBuy" })).toThrow();
  expect(parseClientMessage({ type: "shopConfigRequest" }).type).toBe("shopConfigRequest");
  expect(
    parseClientMessage({
      type: "shopConfigSave",
      items: [
        { itemId: "extra.crown", price: 120, available: true },
        { itemId: "shirt.gold", price: 100, available: false },
      ],
    }).type,
  ).toBe("shopConfigSave");
  // price is a loose z.number() on purpose, like settingsSave: an out-of-range or
  // fractional price still parses so the server can answer adminError INVALID_SHOP.
  expect(
    parseClientMessage({
      type: "shopConfigSave",
      items: [{ itemId: "extra.crown", price: 0.5, available: true }],
    }).type,
  ).toBe("shopConfigSave");
  expect(() =>
    parseClientMessage({ type: "shopConfigSave", items: [{ itemId: "extra.crown", price: 120 }] }),
  ).toThrow();
});

test("each shop server message parses", () => {
  const shopItems = [
    { id: "extra.crown", name: "Crown", kind: "extra", price: 100, available: true, owned: true },
    { id: "eyeColor.gold", name: "Glowing Gold", kind: "eyeColor", price: 80, available: false, owned: false },
  ];
  expect(parseServerMessage({ type: "shop", items: shopItems, balance: 140 }).type).toBe("shop");
  expect(() => parseServerMessage({ type: "shop", items: shopItems, balance: -1 })).toThrow();
  expect(() =>
    parseServerMessage({ type: "shop", items: [{ ...shopItems[0], kind: "pantsColor" }], balance: 0 }),
  ).toThrow();
  expect(
    parseServerMessage({ type: "shopConfig", items: shopItems, updatedAt: 1700000000000, updatedBy: "Riley" }).type,
  ).toBe("shopConfig");
  expect(parseServerMessage({ type: "shopConfig", items: shopItems, updatedAt: null, updatedBy: null }).type).toBe(
    "shopConfig",
  );
  expect(parseServerMessage({ type: "adminError", code: "INVALID_SHOP", message: "Bad price." }).type).toBe(
    "adminError",
  );
  for (const code of ["NOT_OWNED", "NOT_AVAILABLE", "ALREADY_OWNED", "NOT_ENOUGH"]) {
    expect(parseServerMessage({ type: "accountError", code, message: "No." }).type).toBe("accountError");
  }
});

test("appearanceSet from a client without face fields parses with the face defaults", () => {
  const parsed = parseClientMessage({ type: "appearanceSet", appearance: VALID_APPEARANCE });
  if (parsed.type !== "appearanceSet") throw new Error("expected appearanceSet");
  expect(parsed.appearance.eyeShape).toBe("round");
  expect(parsed.appearance.mouthShape).toBe("smile");
});

test("appearanceSet from a client without clothing fields parses with the clothing defaults", () => {
  const parsed = parseClientMessage({ type: "appearanceSet", appearance: VALID_APPEARANCE });
  if (parsed.type !== "appearanceSet") throw new Error("expected appearanceSet");
  expect(parsed.appearance.top).toBe("tee");
  expect(parsed.appearance.bottom).toBe("pants");
  expect(parsed.appearance.onePiece).toBe("none");
  expect(parsed.appearance.graphic).toBe("star");
});
