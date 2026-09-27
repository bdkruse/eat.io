import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import {
  ACCESSORIES,
  AppearanceSchema,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type Appearance,
} from "@eat.io/protocol";
import { manualTime } from "../src/lobby/timers.js";
import { MIGRATIONS, openAccountsDatabase, type AccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Parsed, as the wire would deliver it: the face fields take their defaults.
const SAMPLE_APPEARANCE: Appearance = AppearanceSchema.parse({
  skinTone: SKIN_TONES[0],
  hairStyle: HAIR_STYLES[0],
  hairColor: HAIR_COLORS[0],
  shirtColor: SHIRT_COLORS[0],
  pantsColor: PANTS_COLORS[0],
  accessory: ACCESSORIES[0],
});

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "eatio-accounts-"));
  temporaryDirectories.push(directory);
  return join(directory, "eatio.sqlite");
}

/** A registered account with `lunchMoney` to spend, set directly. */
function accountWithLunchMoney(store: AccountStore, database: AccountsDatabase, lunchMoney: number): number {
  const registered = store.register("shopper", "correct horse battery staple");
  if (!registered.ok) throw new Error("setup failed");
  database.prepare("UPDATE accounts SET lunch_money = ? WHERE id = ?").run(lunchMoney, registered.account.id);
  return registered.account.id;
}

function makeStore(): {
  database: AccountsDatabase;
  store: AccountStore;
  advance: (ms: number) => void;
} {
  const database = openAccountsDatabase(":memory:");
  const { clock, advance } = manualTime();
  const store = new AccountStore(database, clock);
  return { database, store, advance };
}

describe("AccountStore", () => {
  test("register then find by username is case-insensitive", () => {
    const { store } = makeStore();
    const result = store.register("Bain", "correct horse battery staple");
    expect(result.ok).toBe(true);

    const found = store.findByUsername("BAIN");
    expect(found?.username).toBe("Bain");
  });

  test("a duplicate username in other capitals is rejected", () => {
    const { store } = makeStore();
    store.register("Bain", "correct horse battery staple");
    const duplicate = store.register("bAIN", "another good password");
    expect(duplicate).toEqual({ ok: false, code: "USERNAME_TAKEN" });
  });

  test("a bad username is rejected", () => {
    const { store } = makeStore();
    const result = store.register("no", "correct horse battery staple");
    expect(result).toEqual({ ok: false, code: "INVALID_USERNAME" });
  });

  test("a bad password is rejected", () => {
    const { store } = makeStore();
    const result = store.register("gooduser", "short");
    expect(result).toEqual({ ok: false, code: "INVALID_PASSWORD" });
  });

  test("verifyLogin accepts the right password and rejects the wrong one", () => {
    const { store } = makeStore();
    store.register("gooduser", "correct horse battery staple");
    expect(store.verifyLogin("gooduser", "correct horse battery staple")?.username).toBe("gooduser");
    expect(store.verifyLogin("gooduser", "wrong password entirely")).toBeNull();
  });

  test("recordLogin sets lastLoginAt to the clock", () => {
    const { store, advance } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    advance(5000);
    const updated = store.recordLogin(registered.account.id);
    expect(updated.lastLoginAt).toBe(5000);
  });

  test("a login token resumes to its account, then expires after 30 days and the row is gone", () => {
    const { store, database, advance } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    const token = store.createLoginToken(registered.account.id);
    expect(store.resumeLoginToken(token)?.id).toBe(registered.account.id);

    advance(THIRTY_DAYS_MS);
    expect(store.resumeLoginToken(token)).toBeNull();

    const remaining = database.prepare("SELECT COUNT(*) as count FROM login_tokens").get() as {
      count: number;
    };
    expect(remaining.count).toBe(0);
  });

  test("deleteOtherLoginTokens keeps only the named token", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    const keepToken = store.createLoginToken(registered.account.id);
    const otherToken1 = store.createLoginToken(registered.account.id);
    const otherToken2 = store.createLoginToken(registered.account.id);

    store.deleteOtherLoginTokens(registered.account.id, keepToken);

    expect(store.resumeLoginToken(keepToken)?.id).toBe(registered.account.id);
    expect(store.resumeLoginToken(otherToken1)).toBeNull();
    expect(store.resumeLoginToken(otherToken2)).toBeNull();
  });

  test("changePassword succeeds, rejects the wrong current password, and rejects a bad new password", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");
    const accountId = registered.account.id;

    expect(store.changePassword(accountId, "wrong password entirely", "new good password")).toBe(
      "WRONG_PASSWORD",
    );
    expect(store.changePassword(accountId, "correct horse battery staple", "short")).toBe(
      "INVALID_PASSWORD",
    );
    expect(store.changePassword(accountId, "correct horse battery staple", "new good password")).toBe("ok");
    expect(store.verifyLogin("gooduser", "new good password")).not.toBeNull();
  });

  test("saveAppearance round-trips", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    store.saveAppearance(registered.account.id, SAMPLE_APPEARANCE);
    const found = store.get(registered.account.id);
    expect(found?.appearance).toEqual(SAMPLE_APPEARANCE);
  });

  test("a stored appearance that fails schema validation reads back as null", () => {
    const { store, database } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    database
      .prepare("UPDATE accounts SET appearance = ? WHERE id = ?")
      .run("{\"skinTone\":\"#not-a-real-color\"}", registered.account.id);

    const found = store.get(registered.account.id);
    expect(found?.appearance).toBeNull();
  });

  test("recordGames updates points, games played, and games won across a win, a loss, and a draw", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");
    const accountId = registered.account.id;

    store.recordGames([
      { accountId, score: 12, won: true },
      { accountId, score: 0, won: false },
      { accountId, score: 6, won: false },
    ]);

    const found = store.get(accountId);
    expect(found?.pointsScored).toBe(18);
    expect(found?.gamesPlayed).toBe(3);
    expect(found?.gamesWon).toBe(1);
  });

  test("recordGames adds each score to Lunch Money", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");
    const accountId = registered.account.id;
    expect(registered.account.lunchMoney).toBe(0);

    store.recordGames([{ accountId, score: 12, won: true }]);
    store.recordGames([{ accountId, score: 7, won: false }]);

    expect(store.get(accountId)?.lunchMoney).toBe(19);
  });

  test("profileOf carries Lunch Money and the owned items", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 100);
    store.buyItem(accountId, "extra.crown", 60);

    const profile = store.profileOf(store.get(accountId)!);
    expect(profile.lunchMoney).toBe(40);
    expect(profile.ownedItems).toEqual(["extra.crown"]);
  });

  test("inserting an unknown role directly is rejected by the check constraint", () => {
    const { database } = makeStore();
    expect(() =>
      database
        .prepare("INSERT INTO accounts (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)")
        .run("intruder", "irrelevant", "boss", 0),
    ).toThrow();
  });

  test("profileOf a creator lists admin.open among its permissions", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple", "creator");
    if (!registered.ok) throw new Error("setup failed");

    const profile = store.profileOf(registered.account);
    expect(profile.permissions).toContain("admin.open");
  });
});

describe("migration 3", () => {
  test("backfills Lunch Money from points scored for accounts made before it", () => {
    const databasePath = temporaryDatabasePath();
    const oldDatabase = new Database(databasePath);
    oldDatabase.exec(MIGRATIONS[0]!);
    oldDatabase.exec(MIGRATIONS[1]!);
    oldDatabase.pragma("user_version = 2");
    const insertAccount = oldDatabase.prepare(
      "INSERT INTO accounts (username, password_hash, points_scored, created_at) VALUES (?, 'irrelevant', ?, 0)",
    );
    insertAccount.run("veteran", 137);
    insertAccount.run("newcomer", 0);
    oldDatabase.close();

    const database = openAccountsDatabase(databasePath);
    const { clock } = manualTime();
    const store = new AccountStore(database, clock);
    expect(database.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    expect(store.findByUsername("veteran")?.lunchMoney).toBe(137);
    expect(store.findByUsername("newcomer")?.lunchMoney).toBe(0);
    expect(store.findByUsername("veteran")?.ownedItems).toEqual([]);
    database.close();
  });
});

describe("buyItem", () => {
  test("deducts the price once and records ownership", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 100);

    const result = store.buyItem(accountId, "extra.crown", 60);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.lunchMoney).toBe(40);
    expect(result.account.ownedItems).toEqual(["extra.crown"]);
    expect(store.get(accountId)?.lunchMoney).toBe(40);
  });

  test("refuses an item already owned without charging again", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 100);
    store.buyItem(accountId, "extra.crown", 30);

    expect(store.buyItem(accountId, "extra.crown", 30)).toEqual({ ok: false, code: "ALREADY_OWNED" });
    expect(store.get(accountId)?.lunchMoney).toBe(70);
    expect(store.get(accountId)?.ownedItems).toEqual(["extra.crown"]);
  });

  test("refuses an item that costs more than the balance, and changes nothing", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 59);

    expect(store.buyItem(accountId, "extra.crown", 60)).toEqual({ ok: false, code: "NOT_ENOUGH" });
    expect(store.get(accountId)?.lunchMoney).toBe(59);
    expect(store.get(accountId)?.ownedItems).toEqual([]);
  });

  test("an item that costs exactly the balance can be bought, leaving zero", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 60);

    expect(store.buyItem(accountId, "extra.crown", 60).ok).toBe(true);
    expect(store.get(accountId)?.lunchMoney).toBe(0);
  });

  test("two quick buys cannot overspend the balance", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 50);

    const firstBuy = store.buyItem(accountId, "extra.sunglasses", 30);
    const secondBuy = store.buyItem(accountId, "extra.bowTie", 30);

    expect(firstBuy.ok).toBe(true);
    expect(secondBuy).toEqual({ ok: false, code: "NOT_ENOUGH" });
    expect(store.get(accountId)?.lunchMoney).toBe(20);
    expect(store.get(accountId)?.ownedItems).toEqual(["extra.sunglasses"]);
  });

  test("two connections to one database file cannot overspend or double-charge", () => {
    const databasePath = temporaryDatabasePath();
    const { clock } = manualTime();
    const firstDatabase = openAccountsDatabase(databasePath);
    const secondDatabase = openAccountsDatabase(databasePath);
    const firstStore = new AccountStore(firstDatabase, clock);
    const secondStore = new AccountStore(secondDatabase, clock);
    const accountId = accountWithLunchMoney(firstStore, firstDatabase, 50);
    // Both copies read the same starting balance before either buys.
    expect(secondStore.get(accountId)?.lunchMoney).toBe(50);

    expect(firstStore.buyItem(accountId, "extra.sunglasses", 30).ok).toBe(true);
    expect(secondStore.buyItem(accountId, "extra.bowTie", 30)).toEqual({ ok: false, code: "NOT_ENOUGH" });
    expect(secondStore.buyItem(accountId, "extra.sunglasses", 10)).toEqual({ ok: false, code: "ALREADY_OWNED" });
    expect(firstStore.get(accountId)?.lunchMoney).toBe(20);
    firstDatabase.close();
    secondDatabase.close();
  });

  test("a negative balance is refused by the database itself", () => {
    const { store, database } = makeStore();
    const accountId = accountWithLunchMoney(store, database, 10);
    expect(() => database.prepare("UPDATE accounts SET lunch_money = -1 WHERE id = ?").run(accountId)).toThrow();
  });
});
