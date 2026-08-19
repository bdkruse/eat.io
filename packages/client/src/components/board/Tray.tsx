import type { TrayView } from "@eat.io/protocol";
import { layoutTray, OPPONENT_WELLS, YOUR_WELLS } from "../../food/foodLayout.js";
import { Food } from "./Food.js";

interface TrayProps {
  tray: TrayView;
  variant: "you" | "opponent";
  /** Index from the front of the table; drives the advance transform. */
  slot: number;
  /** How many trays are rendered, so slot 0 sits furthest from the child. */
  count: number;
  /** Departing this frame — animates into the child and fades. */
  eaten?: boolean;
  selected?: boolean;
  /** 1-based selection order, shown only for multi-target cards (§2.8.5). */
  order?: number | null;
  onClick?: () => void;
}

export function Tray({
  tray,
  variant,
  slot,
  count,
  eaten = false,
  selected = false,
  order = null,
  onClick,
}: TrayProps) {
  const wells = variant === "you" ? YOUR_WELLS : OPPONENT_WELLS;
  const laid = layoutTray(tray.id, tray.value, wells);

  const className = [
    "tray",
    `tray--${variant}`,
    selected ? "tray--selected" : "",
    eaten ? "tray--eaten" : "",
    onClick ? "tray--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Tray i from the front sits at translateX((n-1-i) * 146px) — §2.8.7.
  const offsetX = (count - 1 - slot) * 146;

  return (
    <div
      className={className}
      style={{ transform: `translateX(${offsetX}px)${eaten ? " scale(0.15)" : ""}` }}
    >
      <div
        className="tray__body"
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(event) => {
          if (!onClick) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
      >
        {order !== null && <span className="tray__order">{order}</span>}
        {wells.map((well, index) => (
          <div
            key={index}
            className="tray__well"
            style={{ width: well.width, height: well.height }}
          >
            <Food shapes={laid.perWell[index] ?? []} />
          </div>
        ))}
        {laid.overflow > 0 && <span className="tray__overflow">+{laid.overflow}</span>}
      </div>
      {/* §2.8.3: the number is never only implied by the food. */}
      <span className="tray__value">{tray.value}</span>
    </div>
  );
}
