import { SHOP_ITEMS } from "@eat.io/protocol";
import type { ShopPurchase } from "../state/gameState.js";

export interface ShopNoticeInput {
  /** The item picked in the shop, or null. */
  selectedItemId: string | null;
  /** The purchase made during this visit to the shop, or null. */
  purchaseSinceMount: ShopPurchase | null;
  /** The item of the last buy that got no answer, or null. */
  unansweredBuyItemId: string | null;
  buying: boolean;
  accountErrorShown: boolean;
}

/**
 * The note under the shop's selection box about the last buy. It speaks only about the item
 * picked now, so picking another item clears it (fix round 1). A buy still in flight, or
 * an error being shown, says more than any note, so neither shows one.
 */
export function shopNoticeText(input: ShopNoticeInput): string | null {
  if (input.buying || input.accountErrorShown || input.selectedItemId === null) return null;
  if (input.purchaseSinceMount?.itemId === input.selectedItemId) {
    const itemName = SHOP_ITEMS.find((item) => item.id === input.selectedItemId)?.name;
    return itemName ? `You bought ${itemName}, and your kid is wearing it.` : null;
  }
  if (input.unansweredBuyItemId === input.selectedItemId) return "The shop did not answer. Try again.";
  return null;
}
