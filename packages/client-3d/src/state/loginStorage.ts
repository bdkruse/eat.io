/**
 * Two small pieces of state that outlive a page reload: the login token that lets a
 * returning player resume without typing a password, and the server address they last
 * used (so a non-default port set up for local development still resumes too).
 *
 * Every access goes through try/catch and degrades to no-op/null — private browsing, a
 * disabled storage API, or a storage quota can all make these calls throw, and none of
 * that should ever break the app. Staying logged in is a convenience, never a requirement.
 */

const LOGIN_TOKEN_KEY = "eatio.loginToken";
const SERVER_URL_KEY = "eatio.serverUrl";

/** Only the bit of the DOM Storage interface these helpers need, so tests can fake it. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readKey(key: string, storage?: StorageLike): string | null {
  try {
    const target = storage ?? browserStorage();
    return target?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string, storage?: StorageLike): void {
  try {
    const target = storage ?? browserStorage();
    target?.setItem(key, value);
  } catch {
    // no-op — see file header
  }
}

function removeKey(key: string, storage?: StorageLike): void {
  try {
    const target = storage ?? browserStorage();
    target?.removeItem(key);
  } catch {
    // no-op — see file header
  }
}

export function loadLoginToken(storage?: StorageLike): string | null {
  return readKey(LOGIN_TOKEN_KEY, storage);
}

export function saveLoginToken(token: string, storage?: StorageLike): void {
  writeKey(LOGIN_TOKEN_KEY, token, storage);
}

export function clearLoginToken(storage?: StorageLike): void {
  removeKey(LOGIN_TOKEN_KEY, storage);
}

export function loadServerUrl(storage?: StorageLike): string | null {
  return readKey(SERVER_URL_KEY, storage);
}

export function saveServerUrl(url: string, storage?: StorageLike): void {
  writeKey(SERVER_URL_KEY, url, storage);
}
