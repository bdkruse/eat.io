import { expect, test } from "vitest";
import type { CardView } from "@eat.io/protocol";
import { cardGlyph } from "../src/ui/cardGlyph.js";

const card = (over: Partial<CardView> = {}): CardView => ({
  id: "c1",
  instanceId: "i1",
  name: "Test Card",
  action: "add",
  amount: 1,
  targets: 1,
  ...over,
});

test("add shows a plus sign and the amount", () => {
  expect(cardGlyph(card({ action: "add", amount: 3 }))).toBe("+3");
});

test("multiply shows a times sign and the amount", () => {
  expect(cardGlyph(card({ action: "multiply", amount: 2 }))).toBe("×2");
});

test("addAll shows the amount applied to every tray", () => {
  expect(cardGlyph(card({ action: "addAll", amount: 1, targets: 0 }))).toBe("+1 all");
});

test("extraServings shows the amount and how many trays it boosts", () => {
  expect(cardGlyph(card({ action: "extraServings", amount: 2, targets: 0, turns: 2 }))).toBe("+2 ×2");
});
