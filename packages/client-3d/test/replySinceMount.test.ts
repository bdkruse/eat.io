import { expect, test } from "vitest";
import type { ServerMessage } from "@eat.io/protocol";
import { initialAppState, type AppState } from "../src/state/gameState.js";
import { gameReducer } from "../src/state/gameReducer.js";
import { replySinceMount } from "../src/ui/replySinceMount.js";

const server = (state: AppState, msg: ServerMessage) => gameReducer(state, { kind: "server", msg });

const settingsMessage = (roundCount: number, updatedBy: string): ServerMessage => ({
  type: "settings",
  settings: { roundCount, turnSeconds: 20, handSize: 5 },
  updatedAt: 1_700_000_000_000,
  updatedBy,
});

test("reopening a panel seeds from the fresh reply, never the value cached from last time", () => {
  // First visit: the panel loaded round count 20, then closed. The reply stays in AppState.
  let state = server(initialAppState, settingsMessage(20, "Riley"));
  const settingsAtMount = state.adminSettings;

  // Reopen. Before the request goes out, the cached reply is not usable.
  expect(replySinceMount(state.adminSettings, settingsAtMount)).toBeNull();

  // The mount effect asks for fresh settings.
  state = gameReducer(state, { kind: "settingsRequested" });
  expect(replySinceMount(state.adminSettings, settingsAtMount)).toBeNull();

  // Meanwhile another Admin changed round count to 12. That is what the panel must seed.
  state = server(state, settingsMessage(12, "Sam"));
  expect(replySinceMount(state.adminSettings, settingsAtMount)?.settings.roundCount).toBe(12);
});

test("a first visit with nothing cached uses the first reply", () => {
  const settingsAtMount = initialAppState.adminSettings;
  const state = server(initialAppState, settingsMessage(20, "Riley"));
  expect(replySinceMount(state.adminSettings, settingsAtMount)?.settings.roundCount).toBe(20);
});

test("a reply equal in content to the cached one still counts, because every reply is a new object", () => {
  let state = server(initialAppState, settingsMessage(20, "Riley"));
  const settingsAtMount = state.adminSettings;
  state = server(gameReducer(state, { kind: "settingsRequested" }), settingsMessage(20, "Riley"));
  expect(replySinceMount(state.adminSettings, settingsAtMount)).not.toBeNull();
});
