import { useEffect, useRef, useState } from "react";
import { SHOP_PRICE_LIMITS } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectAdminMessages } from "../state/gameState.js";
import { replySinceMount } from "./replySinceMount.js";
import {
  createShopConfigDraft,
  setShopItemAvailable,
  setShopItemPriceText,
  shopConfigDraftProblem,
  shopConfigDraftToEntries,
  type ShopConfigDraft,
} from "./shopEditor.js";

/**
 * The creator panel's Shop tab: one row per catalog item with a price field (1–1000) and
 * an available switch, and Save (§13.4). It mounts when the tab is shown, requests the
 * config then, and seeds its draft only from the reply to that request, so a reopened tab
 * never shows or saves stale values (the deck tab's rule).
 */
export function CreatorShopTab({ onClose }: { onClose: () => void }) {
  const { state, requestShopConfig, saveShopConfig } = useGame();
  // Whatever an earlier visit left in AppState. Never used (see replySinceMount).
  const [shopConfigAtMount] = useState(state.adminShopConfig);

  useEffect(() => {
    requestShopConfig();
    // Runs once, when the tab mounts (i.e. each time it is shown) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shopConfig = replySinceMount(state.adminShopConfig, shopConfigAtMount);
  const { notice: adminNotice, error: adminError } = selectAdminMessages(state, "shopConfig");
  const [draft, setDraft] = useState<ShopConfigDraft>({});
  // Seeds once, the first time this mount sees a fresh reply — never again, so it cannot
  // stomp on a price the Creator is typing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (shopConfig && !seededRef.current) {
      seededRef.current = true;
      setDraft(createShopConfigDraft(shopConfig.items));
    }
  }, [shopConfig]);

  const loaded = shopConfig !== null;
  const items = shopConfig?.items ?? [];
  const problem = loaded ? shopConfigDraftProblem(items, draft) : null;
  const canSave = loaded && problem === null && !state.savingShopConfig;

  return (
    <>
      <div className="shop-config">
        {items.map((item) => {
          const itemDraft = draft[item.id] ?? { priceText: String(item.price), available: item.available };
          return (
            <div className="shop-config-row" key={item.id}>
              <span className="shop-config-row__name">{item.name}</span>
              <input
                className="deck-row__input shop-config-row__price"
                type="number"
                min={SHOP_PRICE_LIMITS.min}
                max={SHOP_PRICE_LIMITS.max}
                value={itemDraft.priceText}
                aria-label={`Price of ${item.name}`}
                onChange={(event) => setDraft((current) => setShopItemPriceText(current, item.id, event.target.value))}
              />
              <label className="shop-config-row__available">
                <input
                  type="checkbox"
                  checked={itemDraft.available}
                  onChange={(event) => setDraft((current) => setShopItemAvailable(current, item.id, event.target.checked))}
                />
                Available
              </label>
            </div>
          );
        })}
      </div>

      {loaded && (
        <p className="panel__note">
          Prices are whole numbers from {SHOP_PRICE_LIMITS.min} to {SHOP_PRICE_LIMITS.max}. An item that is not
          available leaves the shop, and players who own it keep it.
        </p>
      )}
      {!loaded && <p className="panel__note">Loading…</p>}
      {problem && <p className="panel__error">{problem}</p>}
      {adminNotice && <p className="panel__note">{adminNotice.text}</p>}
      {adminError && <p className="panel__error">{adminError.message}</p>}

      {shopConfig?.updatedBy && shopConfig.updatedAt !== null && (
        <p className="panel__note">
          Last changed by {shopConfig.updatedBy}, {new Date(shopConfig.updatedAt).toLocaleString()}
        </p>
      )}

      <div className="panel__actions panel__actions--row">
        <button
          className="button button--primary"
          disabled={!canSave}
          onClick={() => saveShopConfig(shopConfigDraftToEntries(items, draft))}
        >
          Save
        </button>
        <button className="button button--secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}
