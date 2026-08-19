import type { FoodShape } from "../../food/foodLayout.js";

export function Food({ shapes }: { shapes: FoodShape[] }) {
  return (
    <>
      {shapes.map((shape) => (
        <span
          key={shape.key}
          className={`tray__food tray__food--${shape.kind}`}
          style={{
            left: shape.x,
            top: shape.y,
            width: shape.size,
            height: shape.size,
            background: shape.color,
          }}
        />
      ))}
    </>
  );
}
