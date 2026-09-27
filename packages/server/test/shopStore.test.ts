import { describe, expect, test } from "vitest";
import { SHOP_ITEMS } from "@eat.io/protocol";
import { manualTime } from "../src/lobby/timers.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { ShopStore } from "../src/shop/shopStore.js";

function makeStores() {
  const database = openAccountsDatabase(":memory:");
  const time = manualTime();
  const accounts = new AccountStore(database, time.clock);
  const shop = new ShopStore(database, time.clock);
  const registered = accounts.register("thecreator", "correct horse battery staple", "creator");
  if (!registered.ok) throw new Error("setup failed");
  return { database, time, accounts, shop, creatorId: registered.account.id };
}

describe("ShopStore", () => {
  test("with nothing saved, every catalog item uses its default price and is available", () => {
    const { shop } = makeStores();
    const config = shop.getConfig();

    expect(config.items).toEqual(
      SHOP_ITEMS.map((item) => ({ itemId: item.id, price: item.defaultPrice, available: true })),
    );
    expect(config.updatedAt).toBeNull();
    expect(config.updatedBy).toBeNull();
  });

  test("a save overrides price and availability, and records who and when", () => {
    const { shop, time, creatorId } = makeStores();
    time.advance(4321);

    shop.saveConfig(
      [
        { itemId: "extra.crown", price: 250, available: true },
        { itemId: "shirt.gold", price: 100, available: false },
      ],
      creatorId,
    );

    const config = shop.getConfig();
    expect(config.items.find((item) => item.itemId === "extra.crown")).toEqual({
      itemId: "extra.crown",
      price: 250,
      available: true,
    });
    expect(config.items.find((item) => item.itemId === "shirt.gold")).toEqual({
      itemId: "shirt.gold",
      price: 100,
      available: false,
    });
    expect(config.updatedAt).toBe(4321);
    expect(config.updatedBy).toBe("thecreator");
  });

  test("an item left out of a save keeps what it had", () => {
    const { shop, creatorId } = makeStores();
    shop.saveConfig([{ itemId: "extra.crown", price: 250, available: false }], creatorId);
    shop.saveConfig([{ itemId: "shirt.gold", price: 5, available: true }], creatorId);

    expect(shop.itemConfig("extra.crown")).toEqual({ itemId: "extra.crown", price: 250, available: false });
    expect(shop.itemConfig("shirt.gold")).toEqual({ itemId: "shirt.gold", price: 5, available: true });
  });

  test("itemConfig of an item with no saved row is its default, and of an unknown id is null", () => {
    const { shop } = makeStores();
    expect(shop.itemConfig("extra.bananaHat")).toEqual({ itemId: "extra.bananaHat", price: 90, available: true });
    expect(shop.itemConfig("extra.jetpack")).toBeNull();
  });

  test("a stored row for an id no longer in the catalog is ignored", () => {
    const { shop, database } = makeStores();
    database.prepare("INSERT INTO shop_items (item_id, price, available) VALUES ('extra.retired', 10, 1)").run();

    expect(shop.getConfig().items.map((item) => item.itemId)).toEqual(SHOP_ITEMS.map((item) => item.id));
    expect(shop.itemConfig("extra.retired")).toBeNull();
  });

  test("the database refuses a price outside 1 to 1000 written directly", () => {
    const { database } = makeStores();
    expect(() =>
      database.prepare("INSERT INTO shop_items (item_id, price, available) VALUES ('extra.crown', 0, 1)").run(),
    ).toThrow();
    expect(() =>
      database.prepare("INSERT INTO shop_items (item_id, price, available) VALUES ('extra.crown', 1001, 1)").run(),
    ).toThrow();
  });
});
