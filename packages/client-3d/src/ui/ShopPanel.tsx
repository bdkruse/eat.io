import { useEffect, useState } from "react";
import { SHOP_ITEM_KINDS, SHOP_ITEMS, type ShopItemKind, type ShopItemView } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectBuyingItemId } from "../state/gameState.js";
import { useLocalState } from "../state/LocalState.js";
import { CoinIcon } from "./icons.js";
import { replySinceMount } from "./replySinceMount.js";

const SHOP_KIND_LABELS: Record<ShopItemKind, string> = {
  extra: "Extras",
  shirtColor: "Shirts",
  hairColor: "Hair colors",
  eyeShape: "Eyes",
  eyeColor: "Eye colors",
  mouthShape: "Mouths",
};

/** The kinds whose items are colors, shown with a swatch of that color. */
const COLOR_KINDS: readonly ShopItemKind[] = ["shirtColor", "hairColor", "eyeColor"];

function itemColor(item: ShopItemView): string | null {
  if (!COLOR_KINDS.includes(item.kind)) return null;
  return SHOP_ITEMS.find((catalogItem) => catalogItem.id === item.id)?.unlocks.value ?? null;
}

/**
 * Docked left. Every available item, grouped by kind, with its price; the ones you own are
 * marked. Picking an item tries it on your kid without saving; Buy spends Lunch Money, and
 * the bought item is then worn and saved (§13.4, §13.7). Only a logged-in player reaches it.
 */
export function ShopPanel() {
  const { state, requestShop, buyItem } = useGame();
  const { shopSelectedItemId, selectShopItem, closeShop } = useLocalState();
  const account = state.account;
  // Only a purchase made during this visit is announced.
  const [purchaseAtMount] = useState(state.shopPurchase);

  useEffect(() => {
    requestShop();
    // Runs once, when the panel mounts (i.e. each time it opens) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The panel keeps fading out for a moment after logging out, while account is already null.
  if (!account) return null;

  const shop = state.shop;
  const balance = shop?.balance ?? account.lunchMoney;
  const items = shop?.items ?? [];
  const selectedItem = items.find((item) => item.id === shopSelectedItemId) ?? null;
  const buying = selectBuyingItemId(state) !== null;
  const purchase = replySinceMount(state.shopPurchase, purchaseAtMount);
  const purchasedItemName = purchase ? SHOP_ITEMS.find((item) => item.id === purchase.itemId)?.name : null;
  const accountError = state.accountError;

  const shortfall = selectedItem ? selectedItem.price - balance : 0;
  const canBuy = selectedItem !== null && !selectedItem.owned && shortfall <= 0 && !buying;

  return (
    <section className="panel panel--shop">
      <div className="shop__header">
        <h2 className="panel__title">Shop</h2>
        <span className="shop__balance" aria-label={`${balance} Lunch Money`}>
          <CoinIcon size={16} />
          {balance}
        </span>
      </div>

      <div className="shop__selection">
        {selectedItem ? (
          <>
            <div className="shop__selection-text">
              <strong>{selectedItem.name}</strong>
              <span className="shop__price">
                <CoinIcon />
                {selectedItem.price}
              </span>
            </div>
            <button className="button button--primary" disabled={!canBuy} onClick={() => buyItem(selectedItem.id)}>
              {selectedItem.owned ? "Owned" : buying ? "Buying…" : "Buy"}
            </button>
          </>
        ) : (
          <p className="shop__selection-hint">Pick something to try it on.</p>
        )}
      </div>
      {selectedItem && !selectedItem.owned && shortfall > 0 && (
        <p className="panel__note">You need {shortfall} more Lunch Money.</p>
      )}
      {purchasedItemName && !buying && !accountError && (
        <p className="panel__note">You bought {purchasedItemName}, and your kid is wearing it.</p>
      )}
      {accountError && <p className="panel__error">{accountError.message}</p>}

      {!shop && <p className="panel__note">Loading…</p>}
      {shop && items.length === 0 && <p className="panel__note">Nothing is for sale right now.</p>}

      {SHOP_ITEM_KINDS.map((kind) => {
        const itemsOfKind = items.filter((item) => item.kind === kind);
        if (itemsOfKind.length === 0) return null;
        return (
          <div className="option-row" key={kind}>
            <span className="option-row__label">{SHOP_KIND_LABELS[kind]}</span>
            <div className="shop-items">
              {itemsOfKind.map((item) => {
                const color = itemColor(item);
                const selected = item.id === shopSelectedItemId;
                return (
                  <button
                    key={item.id}
                    className={selected ? "shop-item shop-item--selected" : "shop-item"}
                    aria-pressed={selected}
                    // Tapping the picked item again takes it off, back to your own look.
                    onClick={() => selectShopItem(selected ? null : item.id)}
                  >
                    {color && <span className="shop-item__swatch" style={{ background: color }} />}
                    <span className="shop-item__name">{item.name}</span>
                    {item.owned ? (
                      <span className="shop-item__owned">Owned</span>
                    ) : (
                      <span className="shop__price">
                        <CoinIcon />
                        {item.price}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="panel__actions panel__actions--row">
        <button className="button button--secondary" onClick={closeShop}>
          Close
        </button>
      </div>
    </section>
  );
}
