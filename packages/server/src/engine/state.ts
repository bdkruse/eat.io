import type { CardAction, RoomPhase, Seat } from "@eat.io/protocol";
import type { Rng } from "../util/rng.js";

export type PlayerId = string;

/** A catalog entry — which card this IS. The natural key for a future database row. */
export interface CardDefinition {
  id: string;
  name: string;
  action: CardAction;
  amount: number;
  /** 0 for a table effect (`addAll`, `extraServings`), which takes no tray choice. */
  targets: number;
  /** Present only on `extraServings`: how many arriving trays it boosts. */
  turns?: number;
}

/** One dealt copy of a definition. Two copies share `id` but never `instanceId`. */
export interface Card extends CardDefinition {
  instanceId: string;
}

export interface Tray {
  id: string;
  value: number;
  /** Present only on a tray that arrived boosted: the extra servings folded into `value`
   *  when it arrived. Never 0 — an unboosted tray has no `bonus` at all. */
  bonus?: number;
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
  /** Upcoming bonuses. Index 0 is added to the next tray to arrive; never holds a 0. */
  extraServings: number[];
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
