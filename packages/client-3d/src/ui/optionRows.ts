import { SHOP_ITEMS, type Appearance, type ShopItemView } from "@eat.io/protocol";

/** One option in a Customize row: free for anyone, an owned shop value, or a shop value
 *  still locked behind its price (§13.4). */
export type OptionEntry<Value extends string> =
  | { value: Value; status: "free" }
  | { value: Value; status: "owned"; itemId: string }
  | { value: Value; status: "locked"; itemId: string; price: number };

/**
 * The options a Customize row shows, in the option list's own order (free values first).
 *
 * - **Free:** a value no shop item unlocks.
 * - **Owned:** ownership comes from the profile, never from the shop, because the shop
 *   lists only available items and an owned item the Creator turned off must stay wearable.
 * - **Locked:** a value you do not own that the shop is selling, with the Creator's price.
 *
 * A value you do not own that the shop is not selling (turned off, or the shop has not
 * answered yet, or you are a guest with no shop at all) is left out: it cannot be bought.
 */
export function optionRowEntries<Value extends string>(
  field: keyof Appearance,
  values: readonly Value[],
  ownedItemIds: readonly string[],
  shopItems: readonly ShopItemView[] | null,
): OptionEntry<Value>[] {
  const entries: OptionEntry<Value>[] = [];
  for (const value of values) {
    const item = SHOP_ITEMS.find((shopItem) => shopItem.unlocks.field === field && shopItem.unlocks.value === value);
    if (!item) {
      entries.push({ value, status: "free" });
      continue;
    }
    if (ownedItemIds.includes(item.id)) {
      entries.push({ value, status: "owned", itemId: item.id });
      continue;
    }
    const shopItemView = shopItems?.find((offeredItem) => offeredItem.id === item.id);
    if (shopItemView) entries.push({ value, status: "locked", itemId: item.id, price: shopItemView.price });
  }
  return entries;
}
