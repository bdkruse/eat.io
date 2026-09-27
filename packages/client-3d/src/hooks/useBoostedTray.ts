import { useEffect, useRef, useState } from "react";
import type { TrayView } from "@eat.io/protocol";
import { detectBoostedTrayId, type BoardSnapshot } from "../scene/game/boostedTray.js";

/** How long a boosted tray keeps its highlight once it slides on. */
const BOOST_HIGHLIGHT_MS = 1500;

/**
 * The id of the tray that just arrived boosted, held for a brief highlight as it slides
 * on, or null the rest of the time. Compares each update to the previous one — the same
 * consecutive-snapshots approach as `useEatenTrays` — and never recomputes the bonus
 * itself, only flags the tray it already landed on (§9).
 */
export function useBoostedTray(table: TrayView[], extraServings: number[]): string | null {
  const previous = useRef<BoardSnapshot>({ table, extraServings });
  const [boostedTrayId, setBoostedTrayId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const detected = detectBoostedTrayId(previous.current, { table, extraServings });
    previous.current = { table, extraServings };
    if (detected) {
      setBoostedTrayId(detected);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setBoostedTrayId(null);
      }, BOOST_HIGHLIGHT_MS);
    }
  }, [table, extraServings]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return boostedTrayId;
}
