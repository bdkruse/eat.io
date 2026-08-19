import { useEffect, useRef, useState } from "react";
import type { TrayView } from "@eat.io/protocol";

const EATEN_HOLD_MS = 600;

/**
 * §2.8.7 — the departing tray is kept for 600ms flagged as eaten so it can animate into
 * the child. State itself is never delayed: `trays` is always the server's current list;
 * this only *adds* the ghost of the one that just left.
 */
export function useEatenTrays(trays: TrayView[]): {
  rendered: TrayView[];
  eatenIds: Set<string>;
  biting: boolean;
} {
  const previous = useRef<TrayView[]>(trays);
  const [ghosts, setGhosts] = useState<TrayView[]>([]);

  useEffect(() => {
    const currentIds = new Set(trays.map((tray) => tray.id));
    const departed = previous.current.filter((tray) => !currentIds.has(tray.id));
    previous.current = trays;
    if (departed.length === 0) return;

    setGhosts((existing) => [...existing, ...departed]);
    const departedIds = new Set(departed.map((tray) => tray.id));
    const timer = setTimeout(() => {
      setGhosts((existing) => existing.filter((tray) => !departedIds.has(tray.id)));
    }, EATEN_HOLD_MS);
    return () => clearTimeout(timer);
  }, [trays]);

  return {
    rendered: [...ghosts, ...trays],
    eatenIds: new Set(ghosts.map((tray) => tray.id)),
    biting: ghosts.length > 0,
  };
}
