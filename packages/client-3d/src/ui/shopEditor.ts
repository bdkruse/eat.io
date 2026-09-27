import { SHOP_ITEMS, shopConfigProblem, type ShopConfigEntry, type ShopItemView } from "@eat.io/protocol";

/** One item's row in the creator's shop tool: the price field's text and the switch. */
export interface ShopItemDraft {
  priceText: string;
  available: boolean;
}

/**
 * The creator shop tool's working copy, by item id. Seeded from the server's `shopConfig`
 * message and edited locally until Save turns it into `shopConfigSave` entries. Prices are
 * kept as text, so a fraction or an empty field stays as typed and is reported rather than
 * silently changed — the deck editor's rule too.
 */
export type ShopConfigDraft = Record<string, ShopItemDraft>;

const SHOP_ITEM_IDS = SHOP_ITEMS.map((item) => item.id);

export function createShopConfigDraft(items: readonly ShopItemView[]): ShopConfigDraft {
  const draft: ShopConfigDraft = {};
  for (const item of items) draft[item.id] = { priceText: String(item.price), available: item.available };
  return draft;
}

export function setShopItemPriceText(draft: ShopConfigDraft, itemId: string, priceText: string): ShopConfigDraft {
  const current = draft[itemId];
  if (!current) return draft;
  return { ...draft, [itemId]: { ...current, priceText } };
}

export function setShopItemAvailable(draft: ShopConfigDraft, itemId: string, available: boolean): ShopConfigDraft {
  const current = draft[itemId];
  if (!current) return draft;
  return { ...draft, [itemId]: { ...current, available } };
}

/** One entry per item the server listed, in its order. An item missing from the draft
 *  keeps the server's own values. */
export function shopConfigDraftToEntries(items: readonly ShopItemView[], draft: ShopConfigDraft): ShopConfigEntry[] {
  return items.map((item) => {
    const itemDraft = draft[item.id];
    return {
      itemId: item.id,
      price: itemDraft ? parsePriceText(itemDraft.priceText) : item.price,
      available: itemDraft ? itemDraft.available : item.available,
    };
  });
}

/** null when Save may go ahead, else a message naming the item by its display name. It
 *  uses the protocol's own rule, so the tool and the server never disagree. */
export function shopConfigDraftProblem(items: readonly ShopItemView[], draft: ShopConfigDraft): string | null {
  const entries = shopConfigDraftToEntries(items, draft);
  for (const [entryIndex, entry] of entries.entries()) {
    const problem = shopConfigProblem([entry], SHOP_ITEM_IDS);
    if (problem !== null) return problem.replace(`"${entry.itemId}"`, items[entryIndex]?.name ?? entry.itemId);
  }
  return shopConfigProblem(entries, SHOP_ITEM_IDS);
}

function parsePriceText(priceText: string): number {
  return priceText.trim() === "" ? Number.NaN : Number(priceText);
}
