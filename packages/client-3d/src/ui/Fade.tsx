import { useEffect, useState, type ReactNode } from "react";

const FADE_MS = 450;

/**
 * Keeps a panel mounted long enough to fade out, so leaving the menu reads as the menu
 * dissolving while the camera flies, not as it vanishing.
 */
export function Fade({ show, className, children }: { show: boolean; className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      // Mount first at opacity 0, then transition in two frames later, once it has painted.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [show]);

  if (!mounted) return null;
  return <div className={`fade${visible ? " fade--visible" : ""}${className ? ` ${className}` : ""}`}>{children}</div>;
}
