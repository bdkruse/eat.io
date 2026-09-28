import type { RoomStateMessage } from "@eat.io/protocol";
import type { Selection } from "../state/selection.js";

/**
 * The guided practice game's prompts (spec §5.2). Pure: every prompt comes from the room
 * view the server sent, the player's own selection, and how far the player has read. It
 * never decides anything about the game itself.
 */

/** What a prompt points at. The HUD, the hand, and the table each draw their own highlight. */
export type TutorialAnchor =
  | "table"
  | "trays"
  | "eater"
  | "hand"
  | "card"
  | "tray-target"
  | "end-turn"
  | "servings-marker"
  | null;

/** What moves a prompt on: the Next button, a card picked, its trays tapped, the turn
 *  submitted, or the round resolving. */
export type TutorialAdvance = "next" | "select" | "target" | "submit" | "resolve";

export interface TutorialPrompt {
  id: string;
  text: string;
  anchor: TutorialAnchor;
  /** The catalog id of the card to highlight in the hand, or null. */
  suggestedCardId: string | null;
  advance: TutorialAdvance;
}

/** Held in client state and derived again whenever the round changes. */
export interface TutorialProgress {
  roundIndex: number;
  stepIndex: number;
}

/** Something that happened that may move the tutorial on. A submit names the catalog id
 *  of the card played, since the view does not say which card it was. */
export type TutorialEvent =
  | { kind: "next" }
  | { kind: "select" }
  | { kind: "target" }
  | { kind: "submit"; cardId: string }
  | { kind: "roomState" };

export const FRESH_TUTORIAL_PROGRESS: TutorialProgress = { roundIndex: 0, stepIndex: 0 };

/** How long a resolve prompt stays up after its round has resolved, so the player can watch
 *  the tray get eaten (or the marker appear) before the next round's prompt replaces it.
 *  Read by the client, never by the functions here. */
export const TUTORIAL_WATCH_MS = 2500;

/** Shown instead of a card's explanation when that card is no longer in the hand. */
export const PLAY_ANY_CARD = "Play any card";

const TRAY_TEXT = "Tap a tray to put the food on it. The front tray is eaten next";
const DOUBLE_TEXT = "×2 doubles the food on one tray. Try it on a tray with lots of food";
const ADD_ALL_TEXT = "+1 all adds one food to every tray on your side. It needs no tray";
const EXTRA_SERVINGS_TEXT =
  "Extra Servings adds 2 food to each of the next 2 trays that arrive. Watch the marker at the end of your table";

/** A step as written in the script. */
interface TutorialStep extends TutorialPrompt {
  /** The catalog id of the card this step follows: it shows only once the player has
   *  submitted that card this round, and is skipped otherwise. */
  onlyAfterPlaying?: string;
}

/**
 * Every round's steps, in order. Rounds 2 to 4 keep their one explanation on screen while
 * the anchor moves from the card to the trays (round 2) and to End turn. Rounds 3 and 4
 * suggest a card that takes no tray, so their tray step, in round 1's words, shows only
 * for another card picked that does. Round 4's explanation also stays while the round
 * resolves, since that is when the marker shows, but only after Extra Servings is played.
 * Round 6 has no steps.
 */
const TUTORIAL_ROUNDS: readonly (readonly TutorialStep[])[] = [
  [
    { id: "welcome", text: "Welcome. This is your side of the table", anchor: "table", advance: "next", suggestedCardId: null },
    {
      id: "trays",
      text: "These are your trays. Food moves toward the eater at the head of the table",
      anchor: "trays",
      advance: "next",
      suggestedCardId: null,
    },
    {
      id: "eater",
      text: "At the end of each round, the eater eats your front tray. Its food becomes your points",
      anchor: "eater",
      advance: "next",
      suggestedCardId: null,
    },
    { id: "add-three-pick", text: "Pick the +3 card", anchor: "card", advance: "select", suggestedCardId: "add3x1" },
    { id: "add-three-tray", text: TRAY_TEXT, anchor: "tray-target", advance: "target", suggestedCardId: null },
    { id: "add-three-end-turn", text: "Press End turn", anchor: "end-turn", advance: "submit", suggestedCardId: null },
    {
      id: "opponent-plays",
      text: "Sam plays too. Watch your front tray get eaten",
      anchor: "trays",
      advance: "resolve",
      suggestedCardId: null,
    },
  ],
  [
    { id: "double-pick", text: DOUBLE_TEXT, anchor: "card", advance: "select", suggestedCardId: "mul2x1" },
    { id: "double-tray", text: DOUBLE_TEXT, anchor: "tray-target", advance: "target", suggestedCardId: "mul2x1" },
    { id: "double-end-turn", text: DOUBLE_TEXT, anchor: "end-turn", advance: "submit", suggestedCardId: "mul2x1" },
  ],
  [
    { id: "add-all-pick", text: ADD_ALL_TEXT, anchor: "card", advance: "select", suggestedCardId: "addAll1" },
    { id: "add-all-tray", text: TRAY_TEXT, anchor: "tray-target", advance: "target", suggestedCardId: null },
    { id: "add-all-end-turn", text: ADD_ALL_TEXT, anchor: "end-turn", advance: "submit", suggestedCardId: "addAll1" },
  ],
  [
    { id: "servings-pick", text: EXTRA_SERVINGS_TEXT, anchor: "card", advance: "select", suggestedCardId: "servings2x2" },
    { id: "servings-tray", text: TRAY_TEXT, anchor: "tray-target", advance: "target", suggestedCardId: null },
    { id: "servings-end-turn", text: EXTRA_SERVINGS_TEXT, anchor: "end-turn", advance: "submit", suggestedCardId: "servings2x2" },
    // The card has left the hand by now, so this step suggests nothing and keeps its text.
    {
      id: "servings-watch",
      text: EXTRA_SERVINGS_TEXT,
      anchor: "servings-marker",
      advance: "resolve",
      suggestedCardId: null,
      onlyAfterPlaying: "servings2x2",
    },
  ],
  [{ id: "on-your-own", text: "You are on your own now. Play any card", anchor: "hand", advance: "submit", suggestedCardId: null }],
  [],
];

function stepAt(progress: TutorialProgress): TutorialStep | undefined {
  return TUTORIAL_ROUNDS[progress.roundIndex]?.[progress.stepIndex];
}

function locateStep(promptId: string): TutorialProgress | null {
  for (const [roundIndex, steps] of TUTORIAL_ROUNDS.entries()) {
    const stepIndex = steps.findIndex((step) => step.id === promptId);
    if (stepIndex !== -1) return { roundIndex, stepIndex };
  }
  return null;
}

function tutorialApplies(view: RoomStateMessage): boolean {
  return view.mode === "practice" && view.phase === "in-progress";
}

/**
 * True while a round has resolved but the progress still sits on that round's resolve
 * step: the player is watching what happened, so its prompt stays up. The client ends the
 * watch after `TUTORIAL_WATCH_MS` by sending the `roomState` event.
 */
export function tutorialWatchingResolvedRound(progress: TutorialProgress, view: RoomStateMessage): boolean {
  return tutorialApplies(view) && progress.roundIndex < view.roundIndex && stepAt(progress)?.advance === "resolve";
}

/** A step the player finishes by playing: picking a card, tapping its trays, ending the turn. */
function isCardStep(step: TutorialPrompt): boolean {
  return step.advance === "select" || step.advance === "target" || step.advance === "submit";
}

/**
 * Whether the view or the selection already shows a card step done. A card step is done by
 * what is on screen, so clearing the selection goes back to picking a card, and a card that
 * takes no tray skips the tray step. Next and resolve steps are never done on screen: the
 * progress passes them.
 */
function doneOnScreen(step: TutorialPrompt, view: RoomStateMessage, selection: Selection): boolean {
  if (!isCardStep(step)) return false;
  if (view.you.submitted) return true;
  const selectedCard = view.you.hand.find((handCard) => handCard.instanceId === selection.cardInstanceId);
  if (step.advance === "select") return selectedCard !== undefined;
  if (step.advance === "target") {
    return selectedCard !== undefined && selection.targetTrayIds.length >= selectedCard.targets;
  }
  return false;
}

function asShown(step: TutorialStep, view: RoomStateMessage): TutorialPrompt {
  const { id, text, anchor, suggestedCardId, advance } = step;
  const prompt: TutorialPrompt = { id, text, anchor, suggestedCardId, advance };
  if (suggestedCardId === null) return prompt;
  const inHand = view.you.hand.some((handCard) => handCard.id === suggestedCardId);
  if (inHand) return prompt;
  return {
    ...prompt,
    text: PLAY_ANY_CARD,
    suggestedCardId: null,
    anchor: step.anchor === "card" ? "hand" : step.anchor,
  };
}

/** The prompt to show, or null for none. Pure: reads the room view, the local selection,
 *  and the progress, never game rules. */
export function tutorialPrompt(
  view: RoomStateMessage,
  selection: Selection,
  progress: TutorialProgress,
): TutorialPrompt | null {
  if (!tutorialApplies(view)) return null;
  if (tutorialWatchingResolvedRound(progress, view)) {
    const watchedStep = stepAt(progress);
    return watchedStep ? asShown(watchedStep, view) : null;
  }
  const steps = TUTORIAL_ROUNDS[view.roundIndex] ?? [];
  // Progress from another round is stale (a reload, a reconnect): start this round over.
  const readUpTo = progress.roundIndex === view.roundIndex ? progress.stepIndex : 0;
  // The first step not yet done: a Next step before the progress was read, but a card step
  // counts only while the screen still shows it done. A step that follows one card's play
  // shows only once the progress has reached it, which the submit of that card does.
  const shownStep = steps.find((step, stepIndex) => {
    const readPast = stepIndex < readUpTo && !isCardStep(step);
    const notReached = step.onlyAfterPlaying !== undefined && stepIndex > readUpTo;
    return !readPast && !notReached && !doneOnScreen(step, view, selection);
  });
  return shownStep ? asShown(shownStep, view) : null;
}

/** The progress after an event: "next" pressed, a card selected, targets chosen, the turn
 *  submitted, or a new roomState. `prompt` is the prompt on screen when the event came. */
export function advanceTutorial(
  progress: TutorialProgress,
  event: TutorialEvent,
  prompt: TutorialPrompt | null,
  view: RoomStateMessage,
): TutorialProgress {
  if (event.kind === "roomState") {
    // A new round (or a new room) derives the progress again from the view.
    if (view.roundIndex === progress.roundIndex) return progress;
    return { roundIndex: view.roundIndex, stepIndex: 0 };
  }
  // Playing on while a resolved round is still being watched ends the watch. The new
  // round's prompt then follows what is on screen, such as a card already picked.
  if (tutorialWatchingResolvedRound(progress, view)) return { roundIndex: view.roundIndex, stepIndex: 0 };
  if (prompt === null || prompt.advance !== event.kind) return progress;
  const location = locateStep(prompt.id);
  if (location === null) return progress;
  const steps = TUTORIAL_ROUNDS[location.roundIndex] ?? [];
  let nextStepIndex = location.stepIndex + 1;
  // A submit passes over the steps that follow a different card's play.
  while (event.kind === "submit") {
    const cardToFollow = steps[nextStepIndex]?.onlyAfterPlaying;
    if (cardToFollow === undefined || cardToFollow === event.cardId) break;
    nextStepIndex += 1;
  }
  return { roundIndex: location.roundIndex, stepIndex: nextStepIndex };
}
