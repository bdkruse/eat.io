import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGame } from "@eat.io/client/state/GameProvider.js";
import { selectYourCard } from "@eat.io/client/state/gameState.js";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
  type Selection,
} from "@eat.io/client/state/selection.js";
import { DEFAULT_APPEARANCE, type Appearance } from "../appearance/appearance.js";

/**
 * State that belongs to this browser tab only and never reaches the server: how your kid
 * looks, whether the customize screen is open, and what you have picked this turn.
 * Customization deliberately does not persist.
 */
export interface LocalStateApi {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  customizing: boolean;
  setCustomizing: (open: boolean) => void;
  selection: Selection;
  /** How many trays the chosen card takes; 0 with no card chosen. */
  targetCount: number;
  ready: boolean;
  chooseCard: (cardInstanceId: string) => void;
  clickTray: (trayId: string) => void;
  clearSelection: () => void;
  endTurn: () => void;
}

const LocalStateContext = createContext<LocalStateApi | null>(null);

export function LocalStateProvider({ children }: { children: ReactNode }) {
  const { state, submitTurn, noteLocalRejection } = useGame();
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [customizing, setCustomizing] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);

  const roundIndex = state.room?.roundIndex ?? null;
  // A resolved round replaces the hand, and a new room starts clean — never carry a pick over.
  useEffect(() => {
    setSelection(emptySelection);
  }, [roundIndex]);

  const targetCount = selectYourCard(state, selection.cardInstanceId)?.targets ?? 0;
  const ready = isSubmittable(selection, targetCount);

  const chooseCard = useCallback((cardInstanceId: string) => {
    setSelection((current) => selectCard(current, cardInstanceId));
  }, []);

  const clickTray = useCallback(
    (trayId: string) => {
      const result = toggleTray(selection, trayId, targetCount);
      if (result.needsCardFirst) {
        noteLocalRejection("Pick a card first — the card decides how many trays you may target.");
        return;
      }
      setSelection(result.selection);
    },
    [selection, targetCount, noteLocalRejection],
  );

  const endTurn = useCallback(() => {
    if (!ready || !selection.cardInstanceId) return;
    submitTurn(selection.cardInstanceId, selection.targetTrayIds);
    setSelection(emptySelection);
  }, [ready, selection, submitTurn]);

  const api = useMemo<LocalStateApi>(
    () => ({
      appearance,
      setAppearance,
      customizing,
      setCustomizing,
      selection,
      targetCount,
      ready,
      chooseCard,
      clickTray,
      clearSelection: () => setSelection(emptySelection),
      endTurn,
    }),
    [appearance, customizing, selection, targetCount, ready, chooseCard, clickTray, endTurn],
  );

  return <LocalStateContext.Provider value={api}>{children}</LocalStateContext.Provider>;
}

export function useLocalState(): LocalStateApi {
  const api = useContext(LocalStateContext);
  if (!api) throw new Error("useLocalState must be used inside <LocalStateProvider>");
  return api;
}
