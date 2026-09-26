import { expect, test } from "vitest";
import {
  clearLoginToken,
  loadLoginToken,
  loadServerUrl,
  saveLoginToken,
  saveServerUrl,
} from "../src/state/loginStorage.js";

/** A tiny in-memory stand-in for the browser's Storage interface. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const backing = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: () => null,
    get length() {
      return backing.size;
    },
  } as Storage;
}

/** A storage whose every method throws, as a real one might in private browsing. */
function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error("storage blocked");
    },
    setItem: () => {
      throw new Error("storage blocked");
    },
    removeItem: () => {
      throw new Error("storage blocked");
    },
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
}

test("loadLoginToken reads nothing from an empty store", () => {
  expect(loadLoginToken(fakeStorage())).toBeNull();
});

test("saveLoginToken then loadLoginToken round-trips the token", () => {
  const storage = fakeStorage();
  saveLoginToken("tok-123", storage);
  expect(loadLoginToken(storage)).toBe("tok-123");
});

test("clearLoginToken removes a saved token", () => {
  const storage = fakeStorage({ "eatio.loginToken": "tok-123" });
  clearLoginToken(storage);
  expect(loadLoginToken(storage)).toBeNull();
});

test("saveServerUrl then loadServerUrl round-trips the address", () => {
  const storage = fakeStorage();
  saveServerUrl("ws://localhost:9000", storage);
  expect(loadServerUrl(storage)).toBe("ws://localhost:9000");
});

test("the login token and the server url are kept under separate keys", () => {
  const storage = fakeStorage();
  saveLoginToken("tok-abc", storage);
  saveServerUrl("ws://example:8000", storage);
  expect(loadLoginToken(storage)).toBe("tok-abc");
  expect(loadServerUrl(storage)).toBe("ws://example:8000");
});

test("a storage that throws on read degrades to null rather than crashing", () => {
  const storage = throwingStorage();
  expect(loadLoginToken(storage)).toBeNull();
  expect(loadServerUrl(storage)).toBeNull();
});

test("a storage that throws on write is a silent no-op", () => {
  const storage = throwingStorage();
  expect(() => saveLoginToken("tok", storage)).not.toThrow();
  expect(() => saveServerUrl("ws://x", storage)).not.toThrow();
});

test("a storage that throws on delete is a silent no-op", () => {
  const storage = throwingStorage();
  expect(() => clearLoginToken(storage)).not.toThrow();
});

test("with no storage argument and no browser storage available, calls degrade quietly", () => {
  expect(() => loadLoginToken()).not.toThrow();
  expect(loadLoginToken()).toBeNull();
  expect(() => saveLoginToken("tok")).not.toThrow();
  expect(() => clearLoginToken()).not.toThrow();
  expect(loadServerUrl()).toBeNull();
  expect(() => saveServerUrl("ws://x")).not.toThrow();
});
