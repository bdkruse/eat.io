import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGame } from "./GameProvider.js";
import { selectYourCard, shouldShareGuestLook, type AppState } from "./gameState.js";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
  type Selection,
} from "./selection.js";
import { DEFAULT_APPEARANCE, type Appearance } from "../appearance/appearance.js";
import type { DetailLevel } from "../scene/detail.js";

/**
 * State that belongs to this browser tab only and never reaches the server on its own —
 * how your kid looks, whether the customize or profile panel is open, and what you have
 * picked this turn. The look itself IS sent to the server at the moments §11 calls for
 * (connecting, logging in, and pressing Done), but the decision to do so lives here.
 */
export interface LocalStateApi {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  customizing: boolean;
  setCustomizing: (open: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  /** How much of the room to draw; low trades crowd and shadows for frame rate. */
  detail: DetailLevel;
  setDetail: (next: DetailLevel) => void;
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
  const { state, submitTurn, noteLocalRejection, setAppearance: sendAppearanceToServer } = useGame();
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [customizing, setCustomizingState] = useState(false);
  const [profileOpen, setProfileOpenState] = useState(false);
  const [detail, setDetail] = useState<DetailLevel>("high");
  const [selection, setSelection] = useState<Selection>(emptySelection);

  const connected = state.connection.phase === "connected";

  // Opening one closes the other — the customize screen and the profile panel never
  // both show at once.
  const setCustomizing = useCallback(
    (open: boolean) => {
      if (open) setProfileOpenState(false);
      setCustomizingState(open);
      // Done, while connected: a guest's look is shared, a logged-in player's is saved (§11).
      if (!open && connected) sendAppearanceToServer(appearance);
    },
    [connected, appearance, sendAppearanceToServer],
  );

  const setProfileOpen = useCallback((open: boolean) => {
    if (open) setCustomizingState(false);
    setProfileOpenState(open);
  }, []);

  // A match found mid-edit takes you to the table; neither panel may reappear once
  // seated. This is not "Done", so it sends nothing of its own.
  const inRoom = state.room !== null;
  useEffect(() => {
    if (inRoom) {
      setCustomizingState(false);
      setProfileOpenState(false);
    }
  }, [inRoom]);

  const roundIndex = state.room?.roundIndex ?? null;
  // A resolved round replaces the hand, and a new room starts clean — never carry a pick over.
  useEffect(() => {
    setSelection(emptySelection);
  }, [roundIndex]);

  // A guest connection shares its local look, so the opponent sees it too. This must NOT
  // fire while a login or registration attempt is still in flight: `welcome` (which sets
  // identity) and `accountLoggedIn`/`accountError` (which resolve the attempt) are always
  // separate messages, so there is a real gap where identity is set but account is still
  // null even for a login or a token resume — shouldShareGuestLook accounts for that gap
  // via accountPending (fix round 1). It fires again once that gap closes without an
  // account: a failed login leaves a guest whose look has never been shared. (A logout or
  // an expired resume disconnects instead, so neither leaves a connected guest behind.)
  const shouldShareNow = shouldShareGuestLook({
    identitySet: state.identity !== null,
    account: state.account,
    accountPending: state.accountPending,
  });
  const previousShouldShareRef = useRef(false);
  useEffect(() => {
    if (!previousShouldShareRef.current && shouldShareNow) {
      sendAppearanceToServer(appearance);
    }
    previousShouldShareRef.current = shouldShareNow;
    // `appearance` is read at the moment of the transition, not watched, so editing your
    // look afterward must not re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShareNow]);

  // Logging in replaces the local look with the account's saved one. A brand-new account
  // has none yet, so it is seeded with whatever look was already in use instead (§11).
  // Logging out closes the profile panel: it has nothing left to show, and while open it
  // would hide the pre-connect menu the logout returns to (final review, item 3).
  const previousAccountRef = useRef<AppState["account"]>(null);
  useEffect(() => {
    const previousAccount = previousAccountRef.current;
    if (previousAccount !== null && state.account === null) {
      setProfileOpenState(false);
    }
    if (previousAccount === null && state.account !== null) {
      if (state.account.appearance) {
        setAppearance(state.account.appearance);
      } else {
        sendAppearanceToServer(appearance);
      }
    }
    previousAccountRef.current = state.account;
    // `appearance` is read at the moment of transition, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.account]);

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
      profileOpen,
      setProfileOpen,
      detail,
      setDetail,
      selection,
      targetCount,
      ready,
      chooseCard,
      clickTray,
      clearSelection: () => setSelection(emptySelection),
      endTurn,
    }),
    [
      appearance,
      customizing,
      setCustomizing,
      profileOpen,
      setProfileOpen,
      detail,
      selection,
      targetCount,
      ready,
      chooseCard,
      clickTray,
      endTurn,
    ],
  );

  return <LocalStateContext.Provider value={api}>{children}</LocalStateContext.Provider>;
}

export function useLocalState(): LocalStateApi {
  const api = useContext(LocalStateContext);
  if (!api) throw new Error("useLocalState must be used inside <LocalStateProvider>");
  return api;
}
