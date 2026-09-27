/** "waking": the first connection has not opened yet, and the server may still be
 *  starting up from sleep, so the client keeps trying for a while. */
export type ConnectionPhase = "idle" | "connecting" | "waking" | "connected" | "reconnecting" | "failed";

export interface ConnectionState {
  phase: ConnectionPhase;
  error: string | null;
  /** Consecutive reconnect attempts; drives the backoff and resets on success. */
  attempt: number;
}

export const initialConnectionState: ConnectionState = {
  phase: "idle",
  error: null,
  attempt: 0,
};

export type ConnectionEvent =
  | { type: "connect" }
  | { type: "opened" }
  /** withinWakeWindow: still inside the time a sleeping host needs to start up. */
  | { type: "closed"; hadSession: boolean; withinWakeWindow: boolean }
  | { type: "failed"; error: string }
  | { type: "reset" };

export function connectionReducer(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event.type) {
    case "connect":
      return { ...state, phase: "connecting", error: null };
    case "opened":
      return { phase: "connected", error: null, attempt: 0 };
    case "closed":
      // With a session in hand the seat is still ours for the grace window, so retry.
      if (event.hadSession) return { ...state, phase: "reconnecting", attempt: state.attempt + 1 };
      if (state.phase === "connected") return { ...initialConnectionState };
      // Never opened: a free host may be asleep and starting up, so keep trying for a
      // while before calling it a failure.
      if (event.withinWakeWindow) return { phase: "waking", error: null, attempt: state.attempt + 1 };
      return { phase: "failed", error: state.error ?? UNREACHABLE, attempt: 0 };
    case "failed":
      return { ...state, phase: "failed", error: event.error };
    case "reset":
      return { ...initialConnectionState };
    default: {
      const never: never = event;
      return never;
    }
  }
}

const UNREACHABLE = "Could not reach the server.";

/** How long a sleeping host is given to start before the client stops waiting. */
export const WAKE_WINDOW_MS = 60_000;
const WAKING_RETRY_MS = 2000;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

/** Exponential backoff, capped so a long outage still retries on a sane cadence. */
export function backoffMs(attempt: number): number {
  const steps = Math.max(0, attempt - 1);
  return Math.min(BASE_DELAY_MS * 2 ** steps, MAX_DELAY_MS);
}

/** When to try again, or null when nothing should retry on its own. */
export function retryDelayMs(state: ConnectionState): number | null {
  if (state.phase === "waking") return WAKING_RETRY_MS;
  if (state.phase === "reconnecting") return backoffMs(state.attempt);
  return null;
}
