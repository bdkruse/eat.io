import { useEffect, useRef, useState } from "react";

/** §2.8.7 — the number updates immediately; the pop is decoration over current data. */
export function useScorePop(score: number): boolean {
  const previous = useRef(score);
  const [popping, setPopping] = useState(false);

  useEffect(() => {
    if (score === previous.current) return;
    previous.current = score;
    setPopping(true);
    const timer = setTimeout(() => setPopping(false), 320);
    return () => clearTimeout(timer);
  }, [score]);

  return popping;
}
