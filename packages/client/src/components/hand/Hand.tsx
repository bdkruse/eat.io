import type { CardView } from "@eat.io/protocol";
import { Card } from "./Card.js";

export function Hand({
  cards,
  selectedInstanceId,
  onSelect,
}: {
  cards: CardView[];
  selectedInstanceId: string | null;
  onSelect: (cardInstanceId: string) => void;
}) {
  return (
    <div className="hand">
      {cards.map((card) => (
        // instanceId is unique within the game, so it is a correct React key on its own.
        <Card
          key={card.instanceId}
          card={card}
          selected={selectedInstanceId === card.instanceId}
          onClick={() => onSelect(card.instanceId)}
        />
      ))}
    </div>
  );
}
