import { SHOP_ITEMS, type ShopConfigEntry } from "@eat.io/protocol";
import type { AccountsDatabase } from "../accounts/database.js";
import type { Clock } from "../lobby/timers.js";

/** One catalog item's current price and availability. */
export interface ShopItemConfig {
  itemId: string;
  price: number;
  available: boolean;
}

export interface ShopConfigRecord {
  /** Every catalog item, in catalog order. */
  items: ShopItemConfig[];
  updatedAt: number | null;
  updatedBy: string | null;
}

interface ShopItemRow {
  item_id: string;
  price: number;
  available: number;
}

interface ShopMetaRow {
  updated_at: number | null;
  updated_by_username: string | null;
}

/**
 * The Creator's price and availability for each shop item, merged over the catalog's
 * defaults: an item with no saved row costs its `defaultPrice` and is available. Limits
 * are not enforced here (the lobby does that with `shopConfigProblem`); the database's
 * CHECK constraints are only a backstop against a bad direct write.
 */
export class ShopStore {
  constructor(
    private readonly database: AccountsDatabase,
    private readonly clock: Clock,
  ) {}

  getConfig(): ShopConfigRecord {
    const savedRows = this.database.prepare("SELECT item_id, price, available FROM shop_items").all() as ShopItemRow[];
    const savedRowByItemId = new Map(savedRows.map((row) => [row.item_id, row]));
    const metaRow = this.database
      .prepare(
        `SELECT shop_items_meta.updated_at AS updated_at, accounts.username AS updated_by_username
         FROM shop_items_meta
         LEFT JOIN accounts ON accounts.id = shop_items_meta.updated_by
         WHERE shop_items_meta.id = 1`,
      )
      .get() as ShopMetaRow | undefined;

    return {
      items: SHOP_ITEMS.map((item) => mergedConfig(item.id, item.defaultPrice, savedRowByItemId.get(item.id))),
      updatedAt: metaRow?.updated_at ?? null,
      updatedBy: metaRow?.updated_by_username ?? null,
    };
  }

  /** The item's current config, or null for an id not in the catalog. */
  itemConfig(itemId: string): ShopItemConfig | null {
    const catalogItem = SHOP_ITEMS.find((item) => item.id === itemId);
    if (!catalogItem) return null;
    const savedRow = this.database
      .prepare("SELECT item_id, price, available FROM shop_items WHERE item_id = ?")
      .get(itemId) as ShopItemRow | undefined;
    return mergedConfig(catalogItem.id, catalogItem.defaultPrice, savedRow);
  }

  /** Saves each entry in one transaction. An item left out of `entries` keeps what it had. */
  saveConfig(entries: readonly ShopConfigEntry[], accountId: number): void {
    const updatedAt = this.clock.now();
    const save = this.database.transaction((entriesToSave: readonly ShopConfigEntry[]) => {
      const upsertItem = this.database.prepare(
        `INSERT INTO shop_items (item_id, price, available) VALUES (?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET price = excluded.price, available = excluded.available`,
      );
      for (const entry of entriesToSave) {
        upsertItem.run(entry.itemId, entry.price, entry.available ? 1 : 0);
      }

      this.database
        .prepare(
          `INSERT INTO shop_items_meta (id, updated_at, updated_by)
           VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`,
        )
        .run(updatedAt, accountId);
    });
    save(entries);
  }
}

function mergedConfig(itemId: string, defaultPrice: number, savedRow: ShopItemRow | undefined): ShopItemConfig {
  if (!savedRow) return { itemId, price: defaultPrice, available: true };
  return { itemId, price: savedRow.price, available: savedRow.available === 1 };
}
