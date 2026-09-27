import { expect, test } from "vitest";
import { ACCESSORIES, FREE_ACCESSORIES, FREE_HAIR_COLORS, HAIR_COLORS, type ShopItemView } from "@eat.io/protocol";
import { optionRowEntries } from "../src/ui/optionRows.js";

const shopItem = (over: Partial<ShopItemView> & Pick<ShopItemView, "id">): ShopItemView => ({
  name: over.id,
  kind: "extra",
  price: 50,
  available: true,
  owned: false,
  ...over,
});

test("free values come first as free, in the option list's own order", () => {
  const entries = optionRowEntries("accessory", ACCESSORIES, [], []);
  expect(entries.slice(0, FREE_ACCESSORIES.length)).toEqual(
    FREE_ACCESSORIES.map((value) => ({ value, status: "free" })),
  );
});

test("a shop value you own is owned", () => {
  const entries = optionRowEntries("accessory", ACCESSORIES, ["extra.crown"], [shopItem({ id: "extra.crown" })]);
  expect(entries.find((entry) => entry.value === "crown")).toEqual({
    value: "crown",
    status: "owned",
    itemId: "extra.crown",
  });
});

test("a shop value you do not own is locked, with the Creator's price from the shop", () => {
  const entries = optionRowEntries("accessory", ACCESSORIES, [], [shopItem({ id: "extra.crown", price: 75 })]);
  expect(entries.find((entry) => entry.value === "crown")).toEqual({
    value: "crown",
    status: "locked",
    itemId: "extra.crown",
    price: 75,
  });
});

test("an owned item the Creator turned off (so missing from the shop) is still owned and wearable", () => {
  const entries = optionRowEntries("accessory", ACCESSORIES, ["extra.bowTie"], [shopItem({ id: "extra.crown" })]);
  expect(entries.find((entry) => entry.value === "bowTie")).toEqual({
    value: "bowTie",
    status: "owned",
    itemId: "extra.bowTie",
  });
});

test("an item you do not own that is not in the shop is left out, since it cannot be bought", () => {
  const entries = optionRowEntries("accessory", ACCESSORIES, [], [shopItem({ id: "extra.crown" })]);
  expect(entries.map((entry) => entry.value)).toEqual([...FREE_ACCESSORIES, "crown"]);
});

test("before the shop has answered, owned values show and unowned ones wait", () => {
  const entries = optionRowEntries("hairColor", HAIR_COLORS, ["hair.silver"], null);
  expect(entries.map((entry) => entry.value)).toEqual([...FREE_HAIR_COLORS, "#c9ccd1"]);
});

test("a guest, who owns nothing and has no shop, sees only the free values", () => {
  const entries = optionRowEntries("hairColor", HAIR_COLORS, [], null);
  expect(entries).toEqual(FREE_HAIR_COLORS.map((value) => ({ value, status: "free" })));
});

test("shop items of another field never affect this row", () => {
  // hair.silver unlocks a hair color, never an accessory.
  const entries = optionRowEntries("accessory", ACCESSORIES, ["hair.silver"], [shopItem({ id: "hair.silver", kind: "hairColor" })]);
  expect(entries.map((entry) => entry.value)).toEqual([...FREE_ACCESSORIES]);
});
