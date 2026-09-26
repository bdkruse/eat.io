import { useEffect, useRef, useState } from "react";
import type { TrayView } from "@eat.io/protocol";

const EATEN_HOLD_MS = 600;

/**
 * The departing tray is kept for 600ms, flagged as eaten, so it can be carried to the
 * eater. State itself is never delayed: `trays` is always the server's current list; this
 * only adds the ghost of the one that just left.
 *
 * Same contract as the classic client's hook, with one difference: each ghost owns its own
 * timer, which only unmounting cancels. In the classic version a second table update inside
 * the 600ms window cancelled the pending removal, so a ghost could stay forever — and in
 * 3D that leaves the eater chomping for the rest of the game.
 */
export function useEatenTrays(trays: TrayView[]): {
  rendered: TrayView[];
  eatenIds: Set<string>;
  biting: boolean;
} {
  const previous = useRef<TrayView[]>(trays);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [ghosts, setGhosts] = useState<TrayView[]>([]);

  useEffect(() => {
    const currentIds = new Set(trays.map((tray) => tray.id));
    const departed = previous.current.filter((tray) => !currentIds.has(tray.id));
    previous.current = trays;
    const fresh = departed.filter((tray) => !timers.current.has(tray.id));
    if (fresh.length === 0) return;

    setGhosts((existing) => [...existing, ...fresh]);
    for (const tray of fresh) {
      timers.current.set(
        tray.id,
        setTimeout(() => {
          timers.current.delete(tray.id);
          setGhosts((existing) => existing.filter((ghost) => ghost.id !== tray.id));
        }, EATEN_HOLD_MS),
      );
    }
  }, [trays]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return {
    rendered: [...ghosts, ...trays],
    eatenIds: new Set(ghosts.map((tray) => tray.id)),
    biting: ghosts.length > 0,
  };
}
