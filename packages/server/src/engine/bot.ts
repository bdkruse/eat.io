import type { CardAction, CardView } from "@eat.io/protocol";
import { nextInt, type Rng } from "../util/rng.js";

/** A move the practice bot submits: the same shape a human's `submit` carries. */
export interface BotMove {
  cardInstanceId: string;
  targetTrayIds: string[];
}

/** The part of the bot's own `roomState` view it chooses from. */
export interface BotView {
  you: { table: { id: string; value: number }[]; hand: CardView[] };
}

// What the front tray ends at when a card is played at the front trays.
// Dispatch over data, like the rules' effects — a new action is a new entry.
const FRONT_TRAY_AFTER: Record<CardAction, (frontValue: number, amount: number) => number> = {
  add: (frontValue, amount) => frontValue + amount,
  multiply: (frontValue, amount) => frontValue * amount,
  addAll: (frontValue, amount) => frontValue + amount,
  extraServings: (frontValue) => frontValue,
};

/** Every legal move for the view's own hand: one per card. A card with targets aims at
 *  the front trays (table[0..targets-1]). A card with no targets aims at none. Cards that
 *  need more trays than the table has are left out. */
export function legalBotMoves(view: BotView): BotMove[] {
  const { table, hand } = view.you;
  return hand
    .filter((card) => card.targets <= table.length)
    .map((card) => ({
      cardInstanceId: card.instanceId,
      targetTrayIds: table.slice(0, card.targets).map((tray) => tray.id),
    }));
}

/** Half the time (nextInt(rng, 2) === 0) the move whose front tray ends highest
 *  (add: value + amount; multiply: value * amount; addAll: value + amount;
 *  extraServings: value), else a uniformly random legal move. Ties go to the first
 *  move in hand order. Returns null when there is no legal move. */
export function chooseBotMove(view: BotView, rng: Rng): [BotMove | null, Rng] {
  const moves = legalBotMoves(view);
  if (moves.length === 0) return [null, rng];

  const [coin, afterCoin] = nextInt(rng, 2);
  if (coin === 0) return [bestMove(view, moves), afterCoin];

  const [moveIndex, afterPick] = nextInt(afterCoin, moves.length);
  return [moves[moveIndex]!, afterPick];
}

function bestMove(view: BotView, moves: BotMove[]): BotMove {
  const frontValue = view.you.table[0]?.value ?? 0;
  const cardsByInstanceId = new Map(view.you.hand.map((card) => [card.instanceId, card]));
  let best = moves[0]!;
  let bestFrontValue = -Infinity;
  for (const move of moves) {
    const card = cardsByInstanceId.get(move.cardInstanceId)!;
    const frontValueAfter = FRONT_TRAY_AFTER[card.action](frontValue, card.amount);
    if (frontValueAfter > bestFrontValue) {
      best = move;
      bestFrontValue = frontValueAfter;
    }
  }
  return best;
}
