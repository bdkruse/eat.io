import type { CardAction, RoomPhase, Seat } from "@eat.io/protocol";
import type { Rng } from "../util/rng.js";

export type PlayerId = string;

export interface Card {
  id: string;
  name: string;
  action: CardAction;
  amount: number;
  targets: number;
}

export interface Tray {
  id: string;
  value: number;
}

/** A player's committed choice for the round. `discard` is the idle auto-move. */
export interface Submission {
  cardId: string;
  targetTrayIds: string[];
  discard?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  seat: Seat;
  name: string;
  connected: boolean;
  table: Tray[];
  hand: Card[];
  deck: Card[];
  score: number;
  submission: Submission | null;
}

export interface GameState {
  roomId: string;
  phase: RoomPhase;
  roundIndex: number;
  roundCount: number;
  players: Record<PlayerId, PlayerState>;
  rng: Rng;
  nextTrayId: number;
}
