export type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

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
  | { type: "closed"; hadSession: boolean }
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
      return event.hadSession
        ? { ...state, phase: "reconnecting", attempt: state.attempt + 1 }
        : { ...initialConnectionState };
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

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

/** Exponential backoff, capped so a long outage still retries on a sane cadence. */
export function backoffMs(attempt: number): number {
  const steps = Math.max(0, attempt - 1);
  return Math.min(BASE_DELAY_MS * 2 ** steps, MAX_DELAY_MS);
}
