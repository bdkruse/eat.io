import type { RejectionCode } from "@eat.io/protocol";
import type { GameState, PlayerId, Submission } from "./state.js";
import { pick } from "../util/rng.js";

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: RejectionCode; message: string };

function reject(code: RejectionCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

export function validateAction(
  state: GameState,
  playerId: PlayerId,
  action: Submission,
): ValidationResult {
  const player = state.players[playerId];
  if (!player) return reject("NOT_IN_ROOM", "You are not seated in this room.");
  if (state.phase !== "in-progress") return reject("NOT_YOUR_TURN", "The game is not accepting moves right now.");
  if (player.submission) return reject("ALREADY_SUBMITTED", "You have already submitted this round.");

  const card = player.hand.find((c) => c.id === action.cardId);
  if (!card) return reject("CARD_NOT_HELD", "You do not hold that card.");
  if (action.targetTrayIds.length !== card.targets) {
    return reject("WRONG_TARGET_COUNT", `That card needs ${card.targets} target(s).`);
  }
  if (new Set(action.targetTrayIds).size !== action.targetTrayIds.length) {
    return reject("BAD_TARGET", "A tray was targeted more than once.");
  }
  const ownTrayIds = new Set(player.table.map((t) => t.id));
  for (const id of action.targetTrayIds) {
    if (!ownTrayIds.has(id)) return reject("BAD_TARGET", "You can only target trays on your own table.");
  }
  return { ok: true };
}

export function applyAction(state: GameState, playerId: PlayerId, action: Submission): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  const submission: Submission = { cardId: action.cardId, targetTrayIds: [...action.targetTrayIds] };
  return { ...state, players: { ...state.players, [playerId]: { ...player, submission } } };
}

export function autoMove(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (!player || player.submission || player.hand.length === 0) return state;
  const [card, rng] = pick(state.rng, player.hand);
  const submission: Submission = { cardId: card.id, targetTrayIds: [], discard: true };
  return { ...state, rng, players: { ...state.players, [playerId]: { ...player, submission } } };
}

export function everyoneSubmitted(state: GameState): boolean {
  const players = Object.values(state.players);
  return players.length > 0 && players.every((p) => p.submission !== null);
}
