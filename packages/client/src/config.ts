/** Never hardcode a server literal at a call site — §2.3. */
const FALLBACK_SERVER_URL = "ws://localhost:8000";

type ViteEnv = Record<string, string | undefined>;

export function defaultServerUrl(env: ViteEnv): string {
  const configured = env["VITE_SERVER_URL"];
  if (configured === undefined || configured.trim() === "") return FALLBACK_SERVER_URL;
  return configured.trim();
}

/** The value the Connect screen starts with; the player may override it in the field. */
export function initialServerUrl(): string {
  return defaultServerUrl(import.meta.env as unknown as ViteEnv);
}
