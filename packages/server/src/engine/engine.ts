import type { RejectionCode } from "@eat.io/protocol";
import type { GameState, PlayerId, Submission } from "./state.js";
import { pick } from "../util/rng.js";
import type { Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import type { Card, PlayerState, Tray } from "./state.js";

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

export type GameEvent =
  | { type: "trayEaten"; playerId: PlayerId; trayId: string; value: number }
  | { type: "roundResolved"; roundIndex: number };

function drawCard(deck: Card[], rng: Rng, rules: Rules): [Card, Card[], Rng] {
  if (deck.length === 0) {
    const [fresh, r2] = rules.buildDeck(rng);
    return [fresh[0]!, fresh.slice(1), r2];
  }
  return [deck[0]!, deck.slice(1), rng];
}

export function resolveRound(state: GameState, rules: Rules): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let rng = state.rng;
  let nextTrayId = state.nextTrayId;
  const players: Record<PlayerId, PlayerState> = {};

  // Deterministic order so a seeded game is fully reproducible.
  const ordered = Object.values(state.players).sort((a, b) => a.seat.localeCompare(b.seat));

  for (const p of ordered) {
    let { hand, deck, table, score } = p;
    const sub = p.submission;

    if (sub) {
      if (!sub.discard) {
        const card = hand.find((c) => c.id === sub.cardId);
        if (card) {
          const targets = new Set(sub.targetTrayIds);
          table = table.map((t) => (targets.has(t.id) ? rules.applyEffect(t, card) : t));
        }
      }
      const idx = hand.findIndex((c) => c.id === sub.cardId);
      if (idx >= 0) {
        hand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
        const [drawn, deckAfter, rngAfter] = drawCard(deck, rng, rules);
        deck = deckAfter;
        rng = rngAfter;
        hand = [...hand, drawn];
      }
    }

    const front = table[0];
    if (front) {
      score += front.value;
      table = table.slice(1);
      events.push({ type: "trayEaten", playerId: p.id, trayId: front.id, value: front.value });
    }

    const [value, rngValue] = rules.freshTrayValue(rng);
    rng = rngValue;
    const freshTray: Tray = { id: String(nextTrayId++), value };
    table = [...table, freshTray];

    players[p.id] = { ...p, hand, deck, table, score, submission: null };
  }

  const next: GameState = {
    ...state,
    players,
    rng,
    nextTrayId,
    roundIndex: state.roundIndex + 1,
  };
  events.push({ type: "roundResolved", roundIndex: next.roundIndex });
  return { state: next, events };
}
