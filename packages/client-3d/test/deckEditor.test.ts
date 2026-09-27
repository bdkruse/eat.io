import { expect, test } from "vitest";
import type { DeckCard } from "@eat.io/protocol";
import {
  createDeckDraft,
  deckDraftProblem,
  deckDraftToEntries,
  deckDraftTotal,
  setDeckCardCopies,
  stepDeckCardCopies,
} from "../src/ui/deckEditor.js";

const catalogCards = (): DeckCard[] => [
  { id: "add1x1", name: "Add One Food To One Tray", action: "add", amount: 1, targets: 1, copies: 5 },
  { id: "add1x2", name: "Add One Food To Two Trays", action: "add", amount: 1, targets: 2, copies: 7 },
  { id: "addAll1", name: "Add One Food To Every Tray", action: "addAll", amount: 1, targets: 0, copies: 1 },
  {
    id: "servings2x2",
    name: "Extra Servings",
    action: "extraServings",
    amount: 2,
    targets: 0,
    turns: 2,
    copies: 1,
  },
];

test("a fresh draft copies each card's current count", () => {
  expect(createDeckDraft(catalogCards())).toEqual({
    add1x1: 5,
    add1x2: 7,
    addAll1: 1,
    servings2x2: 1,
  });
});

test("stepping a card's copies moves it up or down by the delta", () => {
  let draft = createDeckDraft(catalogCards());
  draft = stepDeckCardCopies(draft, "add1x1", 1);
  expect(draft.add1x1).toBe(6);
  draft = stepDeckCardCopies(draft, "add1x1", -2);
  expect(draft.add1x1).toBe(4);
});

test("the stepper clamps at the copies-per-card range instead of going negative or past the max", () => {
  let draft = createDeckDraft(catalogCards());
  draft = stepDeckCardCopies(draft, "addAll1", -5);
  expect(draft.addAll1).toBe(0);
  draft = stepDeckCardCopies(draft, "addAll1", 999);
  expect(draft.addAll1).toBe(40);
});

test("typing a copies value is stored exactly, even outside the range, so the problem can surface it", () => {
  const draft = setDeckCardCopies(createDeckDraft(catalogCards()), "add1x1", 45);
  expect(draft.add1x1).toBe(45);
});

test("a typed value is truncated to a whole number", () => {
  const draft = setDeckCardCopies(createDeckDraft(catalogCards()), "add1x1", 6.9);
  expect(draft.add1x1).toBe(6);
});

test("the total reflects the draft, not the cards the draft started from", () => {
  const draft = setDeckCardCopies(createDeckDraft(catalogCards()), "add1x1", 20);
  expect(deckDraftTotal(catalogCards(), draft)).toBe(20 + 7 + 1 + 1);
});

test("entries convert the draft back into deckSave's shape, in the catalog's own order", () => {
  const draft = createDeckDraft(catalogCards());
  expect(deckDraftToEntries(catalogCards(), draft)).toEqual([
    { cardId: "add1x1", copies: 5 },
    { cardId: "add1x2", copies: 7 },
    { cardId: "addAll1", copies: 1 },
    { cardId: "servings2x2", copies: 1 },
  ]);
});

test("a card missing from the draft counts as 0 copies when converting to entries", () => {
  const draft = createDeckDraft(catalogCards());
  const { add1x2: _dropped, ...missingOneCard } = draft;
  expect(deckDraftToEntries(catalogCards(), missingOneCard)).toEqual([
    { cardId: "add1x1", copies: 5 },
    { cardId: "add1x2", copies: 0 },
    { cardId: "addAll1", copies: 1 },
    { cardId: "servings2x2", copies: 1 },
  ]);
});

test("no problem at the starting deck", () => {
  expect(deckDraftProblem(catalogCards(), createDeckDraft(catalogCards()))).toBeNull();
});

test("a copies value outside its range is reported, by way of protocol's deckProblem", () => {
  const draft = setDeckCardCopies(createDeckDraft(catalogCards()), "add1x1", 45);
  expect(deckDraftProblem(catalogCards(), draft)).toContain("add1x1");
});

test("a total below the 10-100 range is reported even when every card is individually in range", () => {
  const draft = setDeckCardCopies(createDeckDraft(catalogCards()), "add1x1", 0);
  expect(deckDraftTotal(catalogCards(), draft)).toBe(9);
  expect(deckDraftProblem(catalogCards(), draft)).toContain("10");
});
