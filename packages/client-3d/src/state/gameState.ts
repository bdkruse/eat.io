import type {
  AccountErrorCode,
  CardView,
  Profile,
  RejectionCode,
  Result,
  RoomStateMessage,
} from "@eat.io/protocol";
import { initialConnectionState, type ConnectionState } from "../connection/connectionState.js";

export interface Rejection {
  /** "LOCAL" marks a client-side complaint (e.g. a tray clicked with no card chosen),
   *  so it is never mistaken for a code the server actually sent. */
  code: RejectionCode | "LOCAL";
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
  seq: number;
}

export interface AccountErrorState {
  code: AccountErrorCode;
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
  seq: number;
}

export interface AccountNotice {
  text: string;
  /** Monotonic, so a repeat of the same notice can re-trigger without a clock. */
  seq: number;
}

export interface AppState {
  connection: ConnectionState;
  /** What the player typed. Survives "Back to menu" so the field is prefilled. */
  name: string;
  identity: { playerId: string; sessionToken: string } | null;
  queued: boolean;
  /** The server's full view, stored verbatim — every update replaces it (§2.5). */
  room: RoomStateMessage | null;
  privateCode: string | null;
  result: Result | null;
  rejection: Rejection | null;
  opponentDropped: { graceEndsAt: number } | null;
  /** The logged-in player's profile, or null for a guest. Survives reconnects (§11). */
  account: Profile | null;
  accountError: AccountErrorState | null;
  accountNotice: AccountNotice | null;
  /**
   * True from the moment a login or registration attempt is sent until it resolves
   * (accountLoggedIn, accountLoggedOut, or accountError), or until backToMenu. While true,
   * this connection cannot yet be assumed to belong to a guest (fix round 1: `welcome` and
   * `accountLoggedIn`/`accountError` are separate messages, so there is always a gap where
   * identity is set but account is still null even for a login or a token resume).
   */
  accountPending: boolean;
}

export const initialAppState: AppState = {
  connection: initialConnectionState,
  name: "",
  identity: null,
  queued: false,
  room: null,
  privateCode: null,
  result: null,
  rejection: null,
  opponentDropped: null,
  account: null,
  accountError: null,
  accountNotice: null,
  accountPending: false,
};

export type Screen = "connect" | "queue" | "game" | "gameOver";

/** Derived, never stored (§2.4). Order matters: a finished game outranks its board. */
export function selectScreen(state: AppState): Screen {
  if (!state.identity) return "connect";
  if (state.result) return "gameOver";
  if (state.room) return "game";
  // Holding a private code means waiting for someone to type it — same screen as the queue.
  if (state.queued || state.privateCode) return "queue";
  return "connect";
}

/** Explicit from the server's submitted flags — never inferred from a turn index (§2.8.10). */
export function selectAwaitingYou(state: AppState): boolean {
  const room = state.room;
  if (!room || room.phase !== "in-progress") return false;
  return !room.you.submitted;
}

/** A board that is not connected must be visibly dead and non-interactive (§2.8.9). */
export function selectBoardFrozen(state: AppState): boolean {
  return state.connection.phase !== "connected";
}

export function selectYourCard(
  state: AppState,
  cardInstanceId: string | null,
): CardView | undefined {
  if (!cardInstanceId || !state.room) return undefined;
  return state.room.you.hand.find((card) => card.instanceId === cardInstanceId);
}

/**
 * Whether this connection should share its local look with the server as a guest's.
 * True only once identity is established, no account is attached, AND no login or
 * registration attempt is in flight — a login and a token resume both leave a window
 * where identity is set but account is still null, and that window must not be mistaken
 * for "definitely a guest" (fix round 1, §11).
 */
export function shouldShareGuestLook(input: {
  identitySet: boolean;
  account: Profile | null;
  accountPending: boolean;
}): boolean {
  return input.identitySet && input.account === null && !input.accountPending;
}
