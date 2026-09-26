import { useGame } from "../state/GameProvider.js";
import { selectScreen } from "../state/gameState.js";
import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  randomAppearance,
  SHIRT_COLORS,
  SKIN_TONES,
  type Accessory,
  type Appearance,
  type HairStyle,
} from "../appearance/appearance.js";
import { useLocalState } from "../state/LocalState.js";

const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  short: "Short",
  bob: "Bob",
  curly: "Curly",
  ponytail: "Ponytail",
  buzz: "Buzz",
  puffs: "Puffs",
};

const ACCESSORY_LABELS: Record<Accessory, string> = {
  none: "None",
  glasses: "Glasses",
  cap: "Cap",
  headband: "Headband",
  beanie: "Beanie",
};

function SwatchRow<ColorValue extends string>({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: readonly ColorValue[];
  value: ColorValue;
  onPick: (color: ColorValue) => void;
}) {
  return (
    <div className="option-row">
      <span className="option-row__label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color}
            className={color === value ? "swatch swatch--picked" : "swatch"}
            style={{ background: color }}
            role="radio"
            aria-checked={color === value}
            aria-label={color}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  );
}

function ChoiceRow<Choice extends string>({
  label,
  choices,
  labels,
  value,
  onPick,
}: {
  label: string;
  choices: readonly Choice[];
  labels: Record<Choice, string>;
  value: Choice;
  onPick: (choice: Choice) => void;
}) {
  return (
    <div className="option-row">
      <span className="option-row__label">{label}</span>
      <div className="chips" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button key={choice} className={choice === value ? "chip chip--picked" : "chip"} role="radio" aria-checked={choice === value} onClick={() => onPick(choice)}>
            {labels[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Just for fun, and just for this visit — nothing here is saved or sent to the server. */
export function CustomizePanel() {
  const { state } = useGame();
  const { appearance, setAppearance, setCustomizing } = useLocalState();
  const waiting = selectScreen(state) === "queue";
  const update = (change: Partial<Appearance>) => setAppearance({ ...appearance, ...change });

  return (
    <section className="panel panel--customize">
      <h2 className="panel__title">Your kid</h2>
      {waiting && <p className="panel__note">Still looking for a lunch buddy — you will be seated when they arrive.</p>}

      <SwatchRow label="Skin" colors={SKIN_TONES} value={appearance.skinTone} onPick={(skinTone) => update({ skinTone })} />
      <ChoiceRow label="Hair" choices={HAIR_STYLES} labels={HAIR_STYLE_LABELS} value={appearance.hairStyle} onPick={(hairStyle) => update({ hairStyle })} />
      <SwatchRow label="Hair color" colors={HAIR_COLORS} value={appearance.hairColor} onPick={(hairColor) => update({ hairColor })} />
      <SwatchRow label="Shirt" colors={SHIRT_COLORS} value={appearance.shirtColor} onPick={(shirtColor) => update({ shirtColor })} />
      <SwatchRow label="Pants" colors={PANTS_COLORS} value={appearance.pantsColor} onPick={(pantsColor) => update({ pantsColor })} />
      <ChoiceRow label="Extra" choices={ACCESSORIES} labels={ACCESSORY_LABELS} value={appearance.accessory} onPick={(accessory) => update({ accessory })} />

      <div className="panel__actions panel__actions--row">
        <button className="button button--secondary" onClick={() => setAppearance(randomAppearance(Math.floor(Math.random() * 1e9)))}>
          Surprise me
        </button>
        <button className="button button--primary" onClick={() => setCustomizing(false)}>
          Done
        </button>
      </div>
      <p className="panel__note">
        {state.account ? "Saved to your account." : "Your opponent sees this look. It resets when you reload."}
      </p>
    </section>
  );
}
