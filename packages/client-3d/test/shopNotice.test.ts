import { expect, test } from "vitest";
import { shopNoticeText } from "../src/ui/shopNotice.js";

const noticeInput = {
  selectedItemId: "extra.crown",
  purchaseSinceMount: { itemId: "extra.crown", seq: 1 },
  unansweredBuyItemId: null,
  buying: false,
  accountErrorShown: false,
};

test("a purchase made this visit is announced while the bought item is selected", () => {
  expect(shopNoticeText(noticeInput)).toBe("You bought Crown, and your kid is wearing it.");
});

test("the purchase notice clears when another item is selected, or none", () => {
  expect(shopNoticeText({ ...noticeInput, selectedItemId: "hair.silver" })).toBeNull();
  expect(shopNoticeText({ ...noticeInput, selectedItemId: null })).toBeNull();
});

test("no purchase notice while a buy is in flight or an error is showing", () => {
  expect(shopNoticeText({ ...noticeInput, buying: true })).toBeNull();
  expect(shopNoticeText({ ...noticeInput, accountErrorShown: true })).toBeNull();
});

test("an unanswered buy says so while its item is selected", () => {
  const unansweredInput = { ...noticeInput, purchaseSinceMount: null, unansweredBuyItemId: "extra.crown" };
  expect(shopNoticeText(unansweredInput)).toBe("The shop did not answer. Try again.");
  expect(shopNoticeText({ ...unansweredInput, selectedItemId: "hair.silver" })).toBeNull();
});

test("nothing to say with no purchase this visit", () => {
  expect(shopNoticeText({ ...noticeInput, purchaseSinceMount: null })).toBeNull();
});
