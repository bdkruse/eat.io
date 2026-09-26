import type { ClientMessage } from "@eat.io/protocol";

/**
 * Holds the accountRegister/accountLogin message that connectAndRegister/connectAndLogin
 * want to send the moment the welcome that follows their connect arrives. Pulled out of
 * GameProvider as a plain, React-free unit so its lifecycle — set once, sent once, and
 * cleared on anything that abandons the attempt (a disconnect, or a fresh plain connect)
 * — is unit-testable on its own (fix round 1: a stale entry here was leaking into an
 * unrelated later connection).
 */
export interface PendingAccountMessageHolder {
  set(message: ClientMessage): void;
  /** Returns the held message and clears it, so it is sent at most once. */
  take(): ClientMessage | null;
  clear(): void;
}

export function createPendingAccountMessageHolder(): PendingAccountMessageHolder {
  let pending: ClientMessage | null = null;
  return {
    set(message) {
      pending = message;
    },
    take() {
      const message = pending;
      pending = null;
      return message;
    },
    clear() {
      pending = null;
    },
  };
}
