/**
 * Free hosts (Bonto among them) put an idle server to sleep and start it again on the
 * next ordinary web request. A WebSocket handshake to a sleeping server is refused and
 * does not wake it, so the client sends a plain request to the same address first.
 */

/** The http(s) address a WebSocket address is served from, or null if it is not one. */
export function wakeUrlFor(serverUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    return null;
  }
  if (parsed.protocol === "wss:") parsed.protocol = "https:";
  else if (parsed.protocol === "ws:") parsed.protocol = "http:";
  else return null;
  return parsed.toString();
}

/**
 * Fire and forget. "no-cors" because the reply is never read, so the server needs no
 * cross-origin headers; any failure is ignored because the WebSocket retry reports it.
 */
export function wakeServer(serverUrl: string): void {
  const wakeUrl = wakeUrlFor(serverUrl);
  if (!wakeUrl || typeof fetch !== "function") return;
  void fetch(wakeUrl, { mode: "no-cors", cache: "no-store" }).catch(() => undefined);
}
