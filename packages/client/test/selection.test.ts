import { expect, test } from "vitest";
import { emptySelection, isSubmittable, selectCard, toggleTray } from "../src/state/selection.js";

test("choosing a different card clears the targets picked for the old one", () => {
  let selection = selectCard(emptySelection, "c-mul-1");
  selection = toggleTray(selection, "t1", 2).selection;
  selection = toggleTray(selection, "t2", 2).selection;
  expect(selection.targetTrayIds).toEqual(["t1", "t2"]);

  selection = selectCard(selection, "c-add-1");
  expect(selection.cardInstanceId).toBe("c-add-1");
  expect(selection.targetTrayIds).toEqual([]);
});

test("re-picking the same card leaves the selection untouched", () => {
  const selection = selectCard(emptySelection, "c-add-1");
  expect(selectCard(selection, "c-add-1")).toBe(selection);
});

test("clicking a tray with no card selected signals rather than silently failing", () => {
  const result = toggleTray(emptySelection, "t1", 1);
  expect(result.needsCardFirst).toBe(true);
  expect(result.selection).toEqual(emptySelection);
});

test("selecting past the target count drops the OLDEST selection rather than refusing", () => {
  let selection = selectCard(emptySelection, "c-add-1"); // one target
  selection = toggleTray(selection, "t1", 1).selection;
  selection = toggleTray(selection, "t2", 1).selection;
  expect(selection.targetTrayIds).toEqual(["t2"]);
});

test("a two-target card keeps selection order, dropping the oldest on overflow", () => {
  let selection = selectCard(emptySelection, "c-mul-1");
  for (const id of ["t1", "t2", "t3"]) selection = toggleTray(selection, id, 2).selection;
  expect(selection.targetTrayIds).toEqual(["t2", "t3"]);
});

test("clicking a selected tray deselects it", () => {
  let selection = selectCard(emptySelection, "c-mul-1");
  selection = toggleTray(selection, "t1", 2).selection;
  selection = toggleTray(selection, "t2", 2).selection;
  selection = toggleTray(selection, "t1", 2).selection;
  expect(selection.targetTrayIds).toEqual(["t2"]);
});

test("submittable requires a card AND exactly its target count", () => {
  let selection = selectCard(emptySelection, "c-mul-1");
  expect(isSubmittable(selection, 2)).toBe(false);
  selection = toggleTray(selection, "t1", 2).selection;
  expect(isSubmittable(selection, 2)).toBe(false);
  selection = toggleTray(selection, "t2", 2).selection;
  expect(isSubmittable(selection, 2)).toBe(true);
});

test("no card means never submittable, however many trays are somehow set", () => {
  expect(isSubmittable({ cardInstanceId: null, targetTrayIds: ["t1"] }, 1)).toBe(false);
});
