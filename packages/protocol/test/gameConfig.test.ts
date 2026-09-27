import { expect, test } from "vitest";
import {
  SETTINGS_LIMITS,
  DECK_LIMITS,
  GameSettingsSchema,
  DeckEntrySchema,
  settingsProblem,
  deckProblem,
  deckTotal,
  AdminErrorCodeSchema,
} from "../src/index.js";
import type { GameSettings, DeckEntry } from "../src/index.js";

function baseSettings(): GameSettings {
  return { roundCount: 20, turnSeconds: 20, handSize: 5 };
}

const KNOWN_CARD_IDS = [
  "add1x1",
  "add1x2",
  "add3x1",
  "mul2x1",
  "mul2x2",
  "mul3x1",
  "addAll1",
  "servings2x2",
] as const;

function fortyCardDeck(): DeckEntry[] {
  return [
    { cardId: "add1x1", copies: 5 },
    { cardId: "add1x2", copies: 7 },
    { cardId: "add3x1", copies: 7 },
    { cardId: "mul2x1", copies: 7 },
    { cardId: "mul2x2", copies: 6 },
    { cardId: "mul3x1", copies: 6 },
    { cardId: "addAll1", copies: 1 },
    { cardId: "servings2x2", copies: 1 },
  ];
}

test("SETTINGS_LIMITS and DECK_LIMITS carry the exact ranges", () => {
  expect(SETTINGS_LIMITS.roundCount).toEqual({ min: 1, max: 30 });
  expect(SETTINGS_LIMITS.turnSeconds).toEqual({ min: 5, max: 120 });
  expect(SETTINGS_LIMITS.handSize).toEqual({ min: 3, max: 8 });
  expect(DECK_LIMITS.copiesPerCard).toEqual({ min: 0, max: 40 });
  expect(DECK_LIMITS.total).toEqual({ min: 10, max: 100 });
});

test("settingsProblem accepts roundCount at 1 and 30", () => {
  expect(settingsProblem({ ...baseSettings(), roundCount: 1 })).toBeNull();
  expect(settingsProblem({ ...baseSettings(), roundCount: 30 })).toBeNull();
});

test("settingsProblem refuses roundCount at 0, 31, and a fraction", () => {
  expect(settingsProblem({ ...baseSettings(), roundCount: 0 })).not.toBeNull();
  expect(settingsProblem({ ...baseSettings(), roundCount: 31 })).not.toBeNull();
  expect(settingsProblem({ ...baseSettings(), roundCount: 15.5 })).not.toBeNull();
});

test("settingsProblem accepts turnSeconds at 5 and 120", () => {
  expect(settingsProblem({ ...baseSettings(), turnSeconds: 5 })).toBeNull();
  expect(settingsProblem({ ...baseSettings(), turnSeconds: 120 })).toBeNull();
});

test("settingsProblem refuses turnSeconds at 4, 121, and a fraction", () => {
  expect(settingsProblem({ ...baseSettings(), turnSeconds: 4 })).not.toBeNull();
  expect(settingsProblem({ ...baseSettings(), turnSeconds: 121 })).not.toBeNull();
  expect(settingsProblem({ ...baseSettings(), turnSeconds: 20.5 })).not.toBeNull();
});

test("settingsProblem accepts handSize at 3 and 8", () => {
  expect(settingsProblem({ ...baseSettings(), handSize: 3 })).toBeNull();
  expect(settingsProblem({ ...baseSettings(), handSize: 8 })).toBeNull();
});

test("settingsProblem refuses handSize at 2, 9, and a fraction", () => {
  expect(settingsProblem({ ...baseSettings(), handSize: 2 })).not.toBeNull();
  expect(settingsProblem({ ...baseSettings(), handSize: 9 })).not.toBeNull();
  expect(settingsProblem({ ...baseSettings(), handSize: 5.5 })).not.toBeNull();
});

test("settingsProblem names the broken limit", () => {
  expect(settingsProblem({ ...baseSettings(), roundCount: 0 })).toMatch(/round count/i);
});

test("deckProblem accepts a valid 40-card deck", () => {
  expect(deckProblem(fortyCardDeck(), KNOWN_CARD_IDS)).toBeNull();
});

test("deckProblem refuses a deck totalling 9 or 101", () => {
  const nineCardDeck: DeckEntry[] = [{ cardId: "add1x1", copies: 9 }];
  expect(deckProblem(nineCardDeck, KNOWN_CARD_IDS)).not.toBeNull();

  const oneHundredOneCardDeck: DeckEntry[] = [
    { cardId: "add1x1", copies: 40 },
    { cardId: "add1x2", copies: 40 },
    { cardId: "add3x1", copies: 21 },
  ];
  expect(deckProblem(oneHundredOneCardDeck, KNOWN_CARD_IDS)).not.toBeNull();
});

test("deckProblem refuses copies of 41 or -1 on a single card", () => {
  const tooManyCopies: DeckEntry[] = [{ cardId: "add1x1", copies: 41 }];
  expect(deckProblem(tooManyCopies, KNOWN_CARD_IDS)).not.toBeNull();

  const negativeCopies: DeckEntry[] = [{ cardId: "add1x1", copies: -1 }, { cardId: "add1x2", copies: 10 }];
  expect(deckProblem(negativeCopies, KNOWN_CARD_IDS)).not.toBeNull();
});

test("deckProblem refuses an unknown card id", () => {
  const deckWithUnknownCard: DeckEntry[] = [{ cardId: "notACard", copies: 10 }];
  expect(deckProblem(deckWithUnknownCard, KNOWN_CARD_IDS)).not.toBeNull();
});

test("deckProblem refuses a duplicate card id", () => {
  const deckWithDuplicateCard: DeckEntry[] = [
    { cardId: "add1x1", copies: 5 },
    { cardId: "add1x1", copies: 5 },
  ];
  expect(deckProblem(deckWithDuplicateCard, KNOWN_CARD_IDS)).not.toBeNull();
});

test("deckTotal sums copies across entries", () => {
  expect(deckTotal(fortyCardDeck())).toBe(40);
  expect(deckTotal([])).toBe(0);
});

test("GameSettingsSchema parses whole numbers", () => {
  expect(GameSettingsSchema.parse(baseSettings())).toEqual(baseSettings());
  expect(() => GameSettingsSchema.parse({ ...baseSettings(), roundCount: 1.5 })).toThrow();
});

test("DeckEntrySchema parses a card id and whole-number copies", () => {
  expect(DeckEntrySchema.parse({ cardId: "add1x1", copies: 5 })).toEqual({ cardId: "add1x1", copies: 5 });
  expect(() => DeckEntrySchema.parse({ cardId: "add1x1", copies: 5.5 })).toThrow();
});

test("AdminErrorCodeSchema accepts the three admin error codes and rejects others", () => {
  expect(AdminErrorCodeSchema.parse("FORBIDDEN")).toBe("FORBIDDEN");
  expect(AdminErrorCodeSchema.parse("INVALID_SETTINGS")).toBe("INVALID_SETTINGS");
  expect(AdminErrorCodeSchema.parse("INVALID_DECK")).toBe("INVALID_DECK");
  expect(() => AdminErrorCodeSchema.parse("NOPE")).toThrow();
});
