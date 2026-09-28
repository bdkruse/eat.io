import { describe, expect, test } from "vitest";
import type { CardView, RoomStateMessage } from "@eat.io/protocol";
import { emptySelection, type Selection } from "../src/state/selection.js";
import {
  FRESH_TUTORIAL_PROGRESS,
  advanceTutorial,
  tutorialPrompt,
  tutorialWatchingResolvedRound,
  type TutorialEvent,
  type TutorialProgress,
  type TutorialPrompt,
} from "../src/tutorial/tutorialSteps.js";

const CARD_TEMPLATES: Record<string, Omit<CardView, "instanceId">> = {
  add3x1: { id: "add3x1", name: "Add Three Food To One Tray", action: "add", amount: 3, targets: 1 },
  mul2x1: { id: "mul2x1", name: "Double Food On One Tray", action: "multiply", amount: 2, targets: 1 },
  addAll1: { id: "addAll1", name: "Add One Food To Every Tray", action: "addAll", amount: 1, targets: 0 },
  servings2x2: { id: "servings2x2", name: "Extra Servings", action: "extraServings", amount: 2, targets: 0, turns: 2 },
  add1x2: { id: "add1x2", name: "Add One Food To Two Trays", action: "add", amount: 1, targets: 2 },
};

const card = (catalogId: string, instanceId: string): CardView => ({ ...CARD_TEMPLATES[catalogId]!, instanceId });

/** The scripted opening hand, in the order the server deals it. */
const OPENING_HAND: CardView[] = [
  card("add3x1", "c1"),
  card("mul2x1", "c2"),
  card("addAll1", "c3"),
  card("servings2x2", "c4"),
  card("add1x2", "c5"),
];

const TRAYS = [
  { id: "t1", value: 2 },
  { id: "t2", value: 3 },
  { id: "t3", value: 1 },
];

const practiceView = (over: Partial<RoomStateMessage> & { hand?: CardView[]; submitted?: boolean } = {}): RoomStateMessage => {
  const { hand = OPENING_HAND, submitted = false, ...rest } = over;
  return {
    type: "roomState",
    mode: "practice",
    phase: "in-progress",
    roundIndex: 0,
    roundCount: 6,
    deadlineAt: null,
    you: { seat: "a", name: "Riley", score: 0, submitted, appearance: null, table: TRAYS, hand, extraServings: [] },
    opponent: { seat: "b", name: "Sam", score: 0, submitted: true, appearance: null, handCount: 5, table: TRAYS, extraServings: [] },
    ...rest,
  };
};

const picked = (cardInstanceId: string, targetTrayIds: string[] = []): Selection => ({ cardInstanceId, targetTrayIds });

/**
 * A small stand-in for the client: it holds the view, the selection, and the progress, and
 * fires the same events LocalState does. Every prompt it shows is recorded in order.
 */
function tutorialDriver(firstView: RoomStateMessage) {
  let view = firstView;
  let selection: Selection = emptySelection;
  let progress: TutorialProgress = FRESH_TUTORIAL_PROGRESS;
  const shown: TutorialPrompt[] = [];

  const current = () => tutorialPrompt(view, selection, progress);
  const record = () => {
    const prompt = current();
    const last = shown[shown.length - 1];
    if (prompt && (last?.id !== prompt.id || last.text !== prompt.text || last.anchor !== prompt.anchor)) shown.push(prompt);
    return prompt;
  };
  const fire = (event: TutorialEvent) => {
    progress = advanceTutorial(progress, event, current(), view);
  };
  record();

  return {
    shown,
    prompt: current,
    progress: () => progress,
    next() {
      fire({ kind: "next" });
      return record();
    },
    select(cardInstanceId: string) {
      selection = picked(cardInstanceId);
      fire({ kind: "select" });
      return record();
    },
    target(trayId: string) {
      selection = { ...selection, targetTrayIds: [...selection.targetTrayIds, trayId] };
      fire({ kind: "target" });
      return record();
    },
    clearSelection() {
      selection = emptySelection;
      return record();
    },
    submit() {
      fire({ kind: "submit" });
      selection = emptySelection;
      view = { ...view, you: { ...view.you, submitted: true } };
      return record();
    },
    /** The next round's view arrives. The prompt is read before and after the roomState event. */
    newRound(hand: CardView[], extra: Partial<RoomStateMessage["you"]> = {}) {
      view = { ...view, roundIndex: view.roundIndex + 1, you: { ...view.you, submitted: false, hand, ...extra } };
      const whileWatching = record();
      fire({ kind: "roomState" });
      return { whileWatching, afterRoomState: record() };
    },
  };
}

const withoutInstance = (hand: CardView[], instanceId: string) => hand.filter((handCard) => handCard.instanceId !== instanceId);

describe("tutorialPrompt and advanceTutorial", () => {
  test("step through every prompt of rounds 1 to 6 in order for the scripted hand", () => {
    const driver = tutorialDriver(practiceView());

    // Round 1.
    expect(driver.prompt()).toMatchObject({ anchor: "table", advance: "next" });
    driver.next();
    expect(driver.prompt()).toMatchObject({ anchor: "trays", advance: "next" });
    driver.next();
    expect(driver.prompt()).toMatchObject({ anchor: "eater", advance: "next" });
    driver.next();
    expect(driver.prompt()).toMatchObject({ anchor: "card", advance: "select", suggestedCardId: "add3x1" });
    driver.select("c1");
    expect(driver.prompt()).toMatchObject({ anchor: "tray-target", advance: "target" });
    driver.target("t1");
    expect(driver.prompt()).toMatchObject({ anchor: "end-turn", advance: "submit" });
    driver.submit();
    expect(driver.prompt()).toMatchObject({ anchor: "trays", advance: "resolve" });

    // Round 2. The round-1 "Sam plays too" prompt stays while the resolved round is watched.
    let hand = [...withoutInstance(OPENING_HAND, "c1"), card("add3x1", "c6")];
    let round = driver.newRound(hand);
    expect(round.whileWatching).toMatchObject({ advance: "resolve", text: "Sam plays too. Watch your front tray get eaten" });
    expect(round.afterRoomState).toMatchObject({ anchor: "card", advance: "select", suggestedCardId: "mul2x1" });
    driver.select("c2");
    expect(driver.prompt()).toMatchObject({ anchor: "tray-target", advance: "target" });
    driver.target("t2");
    expect(driver.prompt()).toMatchObject({ anchor: "end-turn", advance: "submit" });
    expect(driver.submit()).toBeNull();

    // Round 3: no tray step.
    hand = [...withoutInstance(hand, "c2"), card("add1x2", "c7")];
    round = driver.newRound(hand);
    // Round 2 has no resolve step, so there is nothing to watch: round 3 starts at once.
    expect(round.whileWatching).toEqual(round.afterRoomState);
    expect(round.afterRoomState).toMatchObject({ anchor: "card", advance: "select", suggestedCardId: "addAll1" });
    driver.select("c3");
    expect(driver.prompt()).toMatchObject({ anchor: "end-turn", advance: "submit" });
    expect(driver.submit()).toBeNull();

    // Round 4: no tray step, then the marker is watched while the round resolves.
    hand = [...withoutInstance(hand, "c3"), card("mul2x1", "c8")];
    round = driver.newRound(hand);
    expect(round.afterRoomState).toMatchObject({ anchor: "card", advance: "select", suggestedCardId: "servings2x2" });
    driver.select("c4");
    expect(driver.prompt()).toMatchObject({ anchor: "end-turn", advance: "submit" });
    driver.submit();
    expect(driver.prompt()).toMatchObject({ anchor: "servings-marker", advance: "resolve" });

    // Round 5: on your own.
    hand = [...withoutInstance(hand, "c4"), card("add3x1", "c9")];
    round = driver.newRound(hand, { extraServings: [2] });
    expect(round.whileWatching).toMatchObject({ anchor: "servings-marker", suggestedCardId: null });
    expect(round.whileWatching?.text).toBe(
      "Extra Servings adds 2 food to each of the next 2 trays that arrive. Watch the marker at the end of your table",
    );
    expect(round.afterRoomState).toMatchObject({ anchor: "hand", advance: "submit", suggestedCardId: null });
    driver.select("c5");
    expect(driver.prompt()?.text).toBe("You are on your own now. Play any card");
    driver.target("t1");
    driver.target("t2");
    expect(driver.submit()).toBeNull();

    // Round 6: no prompt.
    hand = [...withoutInstance(hand, "c5"), card("add1x2", "c10")];
    round = driver.newRound(hand);
    expect(round.afterRoomState).toBeNull();

    expect(driver.shown.map((prompt) => prompt.text)).toEqual([
      "Welcome. This is your side of the table",
      "These are your trays. Food moves toward the eater at the head of the table",
      "At the end of each round, the eater eats your front tray. Its food becomes your points",
      "Pick the +3 card",
      "Tap a tray to put the food on it. The front tray is eaten next",
      "Press End turn",
      "Sam plays too. Watch your front tray get eaten",
      "×2 doubles the food on one tray. Try it on a tray with lots of food",
      "×2 doubles the food on one tray. Try it on a tray with lots of food",
      "×2 doubles the food on one tray. Try it on a tray with lots of food",
      "+1 all adds one food to every tray on your side. It needs no tray",
      "+1 all adds one food to every tray on your side. It needs no tray",
      "Extra Servings adds 2 food to each of the next 2 trays that arrive. Watch the marker at the end of your table",
      "Extra Servings adds 2 food to each of the next 2 trays that arrive. Watch the marker at the end of your table",
      "Extra Servings adds 2 food to each of the next 2 trays that arrive. Watch the marker at the end of your table",
      "You are on your own now. Play any card",
    ]);
    expect(driver.shown.map((prompt) => prompt.anchor)).toEqual([
      "table",
      "trays",
      "eater",
      "card",
      "tray-target",
      "end-turn",
      "trays",
      "card",
      "tray-target",
      "end-turn",
      "card",
      "end-turn",
      "card",
      "end-turn",
      "servings-marker",
      "hand",
    ]);
  });

  test("picking a different card in round 2 advances like the suggested card, and round 3 still suggests addAll1", () => {
    const roundTwoHand = [...withoutInstance(OPENING_HAND, "c1"), card("add3x1", "c6")];
    const driver = tutorialDriver(practiceView({ roundIndex: 1, hand: roundTwoHand }));
    expect(driver.prompt()).toMatchObject({ suggestedCardId: "mul2x1", advance: "select" });
    driver.select("c6");
    expect(driver.prompt()).toMatchObject({ anchor: "tray-target", advance: "target" });
    driver.target("t3");
    expect(driver.prompt()).toMatchObject({ anchor: "end-turn", advance: "submit" });
    expect(driver.submit()).toBeNull();
    const { afterRoomState } = driver.newRound([...withoutInstance(roundTwoHand, "c6"), card("add1x2", "c7")]);
    expect(afterRoomState).toMatchObject({ suggestedCardId: "addAll1", anchor: "card" });
    expect(afterRoomState?.text).toBe("+1 all adds one food to every tray on your side. It needs no tray");
  });

  test("a card that takes no tray skips the tray step in round 1", () => {
    const driver = tutorialDriver(practiceView());
    driver.next();
    driver.next();
    driver.next();
    driver.select("c3");
    expect(driver.prompt()).toMatchObject({ text: "Press End turn", anchor: "end-turn" });
  });

  test("clearing the selection on the tray step goes back to picking a card", () => {
    const driver = tutorialDriver(practiceView());
    driver.next();
    driver.next();
    driver.next();
    driver.select("c1");
    expect(driver.prompt()?.advance).toBe("target");
    expect(driver.clearSelection()).toMatchObject({ text: "Pick the +3 card", advance: "select" });
  });

  test("a missing suggested card gives Play any card", () => {
    const handWithoutDouble = withoutInstance(OPENING_HAND, "c2");
    const prompt = tutorialPrompt(practiceView({ roundIndex: 1, hand: handWithoutDouble }), emptySelection, {
      roundIndex: 1,
      stepIndex: 0,
    });
    expect(prompt).toMatchObject({ text: "Play any card", suggestedCardId: null, anchor: "hand", advance: "select" });

    const handWithoutAddThree = withoutInstance(OPENING_HAND, "c1");
    const roundOnePick = tutorialPrompt(practiceView({ hand: handWithoutAddThree }), emptySelection, {
      roundIndex: 0,
      stepIndex: 3,
    });
    expect(roundOnePick).toMatchObject({ text: "Play any card", suggestedCardId: null, anchor: "hand" });
  });

  test("a view at round 3 with fresh progress gives round 3's first prompt", () => {
    const view = practiceView({ roundIndex: 2 });
    const prompt = tutorialPrompt(view, emptySelection, FRESH_TUTORIAL_PROGRESS);
    expect(prompt).toMatchObject({ suggestedCardId: "addAll1", anchor: "card", advance: "select" });
    expect(prompt?.text).toBe("+1 all adds one food to every tray on your side. It needs no tray");
    expect(advanceTutorial(FRESH_TUTORIAL_PROGRESS, { kind: "roomState" }, prompt, view)).toEqual({
      roundIndex: 2,
      stepIndex: 0,
    });
  });

  test("round 6 gives null", () => {
    const view = practiceView({ roundIndex: 5 });
    expect(tutorialPrompt(view, emptySelection, { roundIndex: 5, stepIndex: 0 })).toBeNull();
    expect(tutorialPrompt(view, emptySelection, FRESH_TUTORIAL_PROGRESS)).toBeNull();
  });

  test("a match room, or a finished practice game, has no prompt", () => {
    expect(tutorialPrompt(practiceView({ mode: "match" }), emptySelection, FRESH_TUTORIAL_PROGRESS)).toBeNull();
    expect(tutorialPrompt(practiceView({ phase: "finished" }), emptySelection, FRESH_TUTORIAL_PROGRESS)).toBeNull();
  });

  test("an event that does not match the prompt leaves the progress alone", () => {
    const view = practiceView();
    const welcome = tutorialPrompt(view, emptySelection, FRESH_TUTORIAL_PROGRESS);
    expect(advanceTutorial(FRESH_TUTORIAL_PROGRESS, { kind: "submit" }, welcome, view)).toEqual(FRESH_TUTORIAL_PROGRESS);
    expect(advanceTutorial(FRESH_TUTORIAL_PROGRESS, { kind: "next" }, null, view)).toEqual(FRESH_TUTORIAL_PROGRESS);
    expect(advanceTutorial(FRESH_TUTORIAL_PROGRESS, { kind: "roomState" }, welcome, view)).toEqual(FRESH_TUTORIAL_PROGRESS);
  });

  test("a new room at round 1 starts the tutorial over", () => {
    const view = practiceView({ roundIndex: 0 });
    expect(advanceTutorial({ roundIndex: 3, stepIndex: 1 }, { kind: "roomState" }, null, view)).toEqual(FRESH_TUTORIAL_PROGRESS);
  });

  test("playing during the watch ends it, and the new round's prompt follows what is on screen", () => {
    const roundTwo = practiceView({ roundIndex: 1 });
    const watching: TutorialProgress = { roundIndex: 0, stepIndex: 6 };
    const watchedPrompt = tutorialPrompt(roundTwo, emptySelection, watching);
    expect(watchedPrompt?.advance).toBe("resolve");
    const afterPick = advanceTutorial(watching, { kind: "select" }, watchedPrompt, roundTwo);
    expect(afterPick).toEqual({ roundIndex: 1, stepIndex: 0 });
    expect(tutorialPrompt(roundTwo, picked("c2"), afterPick)).toMatchObject({ advance: "target", suggestedCardId: "mul2x1" });
  });

  test("the resolved round is watched only while the progress sits on its resolve step", () => {
    const roundTwo = practiceView({ roundIndex: 1 });
    expect(tutorialWatchingResolvedRound({ roundIndex: 0, stepIndex: 6 }, roundTwo)).toBe(true);
    expect(tutorialWatchingResolvedRound({ roundIndex: 0, stepIndex: 5 }, roundTwo)).toBe(false);
    expect(tutorialWatchingResolvedRound({ roundIndex: 1, stepIndex: 0 }, roundTwo)).toBe(false);
    expect(tutorialWatchingResolvedRound({ roundIndex: 0, stepIndex: 6 }, practiceView({ roundIndex: 1, mode: "match" }))).toBe(false);
  });
});
