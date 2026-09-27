import { expect, test } from "vitest";
import type { ShopItemView } from "@eat.io/protocol";
import {
  createShopConfigDraft,
  setShopItemAvailable,
  setShopItemPriceText,
  shopConfigDraftProblem,
  shopConfigDraftToEntries,
} from "../src/ui/shopEditor.js";

const configItems = (): ShopItemView[] => [
  { id: "extra.crown", name: "Crown", kind: "extra", price: 100, available: true, owned: false },
  { id: "extra.bowTie", name: "Bow Tie", kind: "extra", price: 30, available: false, owned: false },
];

test("a fresh draft copies each item's price, as text, and its availability", () => {
  expect(createShopConfigDraft(configItems())).toEqual({
    "extra.crown": { priceText: "100", available: true },
    "extra.bowTie": { priceText: "30", available: false },
  });
});

test("a typed price is kept exactly as typed", () => {
  const draft = setShopItemPriceText(createShopConfigDraft(configItems()), "extra.crown", "12.5");
  expect(draft["extra.crown"]).toEqual({ priceText: "12.5", available: true });
});

test("the available switch changes only that item", () => {
  const draft = setShopItemAvailable(createShopConfigDraft(configItems()), "extra.bowTie", true);
  expect(draft["extra.bowTie"]).toEqual({ priceText: "30", available: true });
  expect(draft["extra.crown"]).toEqual({ priceText: "100", available: true });
});

test("Save sends one entry per item, in the server's order", () => {
  const draft = setShopItemPriceText(createShopConfigDraft(configItems()), "extra.bowTie", "45");
  expect(shopConfigDraftToEntries(configItems(), draft)).toEqual([
    { itemId: "extra.crown", price: 100, available: true },
    { itemId: "extra.bowTie", price: 45, available: false },
  ]);
});

test("a valid draft has no problem", () => {
  expect(shopConfigDraftProblem(configItems(), createShopConfigDraft(configItems()))).toBeNull();
});

test("a price outside 1 to 1000, a fraction, or an empty field is a problem", () => {
  const items = configItems();
  for (const priceText of ["0", "1001", "12.5", "", "abc"]) {
    const draft = setShopItemPriceText(createShopConfigDraft(items), "extra.crown", priceText);
    expect(shopConfigDraftProblem(items, draft)).toMatch(/Crown/);
  }
});
