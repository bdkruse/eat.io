/** Never hardcode a server literal at a call site. */
const FALLBACK_SERVER_URL = "ws://localhost:8000";

type ViteEnv = Record<string, string | undefined>;

/** The server address fixed at build time, or null when the build left it open. */
export function configuredServerUrl(env: ViteEnv): string | null {
  const configured = env["VITE_SERVER_URL"];
  if (configured === undefined || configured.trim() === "") return null;
  return configured.trim();
}

export function defaultServerUrl(env: ViteEnv): string {
  return configuredServerUrl(env) ?? FALLBACK_SERVER_URL;
}

const buildEnv = () => import.meta.env as unknown as ViteEnv;

/** The value the menu starts with. */
export function initialServerUrl(): string {
  return defaultServerUrl(buildEnv());
}

/**
 * A deployed build names its server, so players are never asked for one. Only a build
 * without VITE_SERVER_URL (local development) shows the Server field.
 */
export function serverIsConfigured(): boolean {
  return configuredServerUrl(buildEnv()) !== null;
}
