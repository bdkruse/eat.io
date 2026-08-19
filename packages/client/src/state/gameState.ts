import type { CardView, RejectionCode, Result, RoomStateMessage } from "@eat.io/protocol";
import { initialConnectionState, type ConnectionState } from "../connection/connectionState.js";

export interface Rejection {
  /** "LOCAL" marks a client-side complaint (e.g. a tray clicked with no card chosen),
   *  so it is never mistaken for a code the server actually sent. */
  code: RejectionCode | "LOCAL";
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
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
};

export type Screen = "connect" | "queue" | "game" | "gameOver";

/** Derived, never stored (§2.4). Order matters: a finished game outranks its board. */
export function selectScreen(state: AppState): Screen {
  if (!state.identity) return "connect";
  if (state.result) return "gameOver";
  if (state.room) return "game";
  if (state.queued) return "queue";
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

export function selectYourCard(state: AppState, cardId: string | null): CardView | undefined {
  if (!cardId || !state.room) return undefined;
  return state.room.you.hand.find((card) => card.id === cardId);
}
