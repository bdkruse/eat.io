import type { CardAction, RoomPhase, Seat } from "@eat.io/protocol";
import type { Rng } from "../util/rng.js";

export type PlayerId = string;

/** A catalog entry — which card this IS. The natural key for a future database row. */
export interface CardDefinition {
  id: string;
  name: string;
  action: CardAction;
  amount: number;
  targets: number;
}

/** One dealt copy of a definition. Two copies share `id` but never `instanceId`. */
export interface Card extends CardDefinition {
  instanceId: string;
}

export interface Tray {
  id: string;
  value: number;
}

/** A player's committed choice for the round. `discard` is the idle auto-move. */
export interface Submission {
  /** Names the specific copy in hand, never the catalog id. */
  cardInstanceId: string;
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
  /** Mints card instance ids the same deterministic way tray ids are minted. */
  nextCardId: number;
}
